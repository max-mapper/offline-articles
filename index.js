var { ipcMain, app, BrowserWindow, session } = require('electron')
const { blockWindowAds, adBlocker } = require('electron-ad-blocker')
var request = require('request')
var run = require('run-series')
var path = require('path')
var url = require('url')
var concat = require('concat-stream')
var fs = require('fs')
var slugify = require('slugify')

var win
var readjs = fs.readFileSync('./Readability.js').toString()

app.on('ready', function () {
  win = new BrowserWindow({width: 800, height: 600, webPreferences: {preload: path.join(__dirname, 'preload.js')}})
//  win.toggleDevTools()
  win.on('closed', function () {
    win = null
  })

  session.defaultSession.webRequest.onHeadersReceived(function (details, callback) {
    var contentType = details.responseHeaders['Content-Type']
    if (contentType && contentType.indexOf('application/pdf') > -1) return callback({cancel: true})
    callback({cancel: false, responseHeaders: details.responseHeaders})
  })
  blockWindowAds(win)
  start()
})

function read (href, cb) {
  win.loadURL(href)
  win.webContents.once('did-fail-load', onFail)
  win.webContents.once('did-finish-load', onLoad)
  ipcMain.once('content', onContent)
  
  setTimeout(onLoad, 10000)

  function cleanup () {
    clearTimeout(onLoad)
    win.webContents.removeListener('did-fail-load', onFail)
    win.webContents.removeListener('did-finish-load', onLoad)
    ipcMain.removeListener('content', onContent)
  }

  function onFail (ev, errCode, errDesc, vurl) {
    if (vurl === href) {
      cleanup()
      return cb(new Error('failed load ' + errDesc)) 
    }
    console.error('failed sub-resource load ' + errCode + ' ' + errDesc + ' ' + vurl)
    return onLoad()
  }

  function onLoad () {
    win.webContents.executeJavaScript(readjs)
    win.webContents.executeJavaScript(`
      var article = new Readability(document).parse()
      OFFLINE_IPC.send('content', article)
    `)
  }

  function onContent (event, content) {
    cleanup()
    win.loadURL('about:blank')
    win.webContents.once('dom-ready', function () {
      console.error('Loaded about:blank')
      if (!content) return cb(new Error('page error'))
      cb(null, content)
    })
  }
}

function start () {
  request('https://www.reddit.com/r/indepthstories.json?limit=100', {json: true}, function (err, resp, json) {
    var fns = []
    json.data.children.forEach(function (ch) {
      var page = {
        url: ch.data.url,
        title: ch.data.title,
        file: './articles/' + slugify(ch.data.title) + '.html'
      }
      if (fs.existsSync(page.file)) return
      fns.push(function (cb) {
        get(page, function (err, page) {
          if (err) {
            err.url = page.url
            return cb(err)
          }
          if (!page) return cb()
          
          render(page)
          return setTimeout(cb, 1000)

          inlineImages(page, function (err, page) {
            if (err) return cb(err)
            render(page)
            setTimeout(cb, 1000)
    　　　})
        })
      })
    })
    run(fns, function (err)　{
  　　console.log('Done')
      if (err) console.error(err)
      process.exit(0)
    })
  })
}

function inlineImages (page, cb) {
  var html = page.content
  var dom = cheerio.load(String(html))
  inlineImages(dom, cb)
  function inlineImages(dom, cb) {
    var fns = []
    dom('img').each(function(idx, el) {
      var fn = function (cb) {
        el = dom(el)
        var src = el.attr('src')
        var dir = ''
        var parsed = url.parse(page.url)
        if (parsed.pathname) {
          var dir = parsed.pathname.split('/')
          dir.shift()
          dir = dir.join('/')
        }
        if (src && src.slice(0,5) !== 'data:') {
          if (src.slice(0, 4) === 'http' ) {
            // do nothing
          } else if (src.slice(0, 2) === '//') {
            src = parsed.protocol + src
          } else if (src.slice(0, 2) === './') {
           var base = parsed.protocol + '//' + path.join(parsed.hostname, dir)
           src = base + src.slice(2)
          } else if (src.slice(0, 1) === '/') {
            src = parsed.protocol + '//' + parsed.hostname + src
          } else {
            // must be relative
            src = parsed.protocol + '//' + path.join(parsed.hostname, dir, src)
          }
          var tries = 3
          getImage()
          function getImage () {
            request(src, {jar: true})
              .on('error', function (err) {
                console.error('Error', tries, src, err.message)
                if (--tries > 0) return setTimeout(getImage, 10000)
                cb(err)
              })
              .pipe(concat(function (buff) {
                var dataUri = "data:application/octet-stream;base64," + buff.toString("base64")
                el.attr('src', dataUri)
                cb()
              }))
          }
        } else {
          cb()
        }
      }
      fns.push(fn)
    })
    run(fns, function (err) {
      if (err) return cb(err)
      page.inlined = dom.html({decodeEntities: false})
      cb(null, page)
    })
  }
}

function getIA(page, cb) {
  console.error('Getting from IA', page)
  tryDl()
  function tryDl () {
    request('https://archive.org/wayback/available?url=' + encodeURIComponent(page), {jar: true, json: true}, function (err, resp, body) {
      if (err || resp.statusCode > 299) return cb(new Error('not cached in IA'))
      var snaps = body.archived_snapshots
      if (!snaps.closest || !snaps.closest.available) {
        archive(function () {}) // ignore response
        return cb(new Error('not cached in IA'))
      }
      return cb(null, snaps.closest.url.replace(/^http\:/, 'https:'))
      
      function archive (cb) {
        request('https://web.archive.org/save/' + page, function (err, resp, body) {
          if (err || resp.statusCode > 299) return cb(new Error('could not get IA version'))
          return cb(null, resp.request.uri)
        })
      }
    })
  }

}

function get (page, cb) {
  return getReadable(page.url)
  getIA(page.url, function (err, archived) {
    if (err) {
      console.error(err.message, page.url)
      return getReadable(page.url)
    }
    getReadable(archived) 
  })
  function getReadable (href) {
    var tries = 3
    console.error('Getting readable', tries, href)
    tryDl()
    function tryDl () {
    　read(href, function (err, article) {
        if (err) {
         if (--tries > 0) {
           if (err.message.indexOf('ERR_BLOCKED_BY_CLIENT') > -1) {
             console.error('blocked by client, skipping')
             return cb(null, null)
           }
           console.error('Error, retrying', tries, err.message)
           return setTimeout(tryDl, 10000)
         }
         cb(null, null)
         return console.error(href, err)
        }
        article.url = href
        article.file = page.file
        article.original = page.url
        cb(null, article)
      })
    }
  }
}

function render (page) {
  var domain = url.parse(page.original).hostname.replace('www.', '')
  var body = `
  <p class="news-domain"><a href="${page.url}">${domain}</a></p>
  <h1 class="news-title"><a href="${page.url}">${page.title}</a></h1>
  ${!!page.byline ? '' : `<p class="news-byline">${page.byline}</p>`}
  ${page.content}
  <hr>`
  var full = renderFull(body)
  fs.writeFileSync(page.file, full) 
  console.error('Saved', page.file) 
  function renderFull (body) {
    return `<html><head>
      <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /></html>
      <link rel="stylesheet" href="style.css"/>
      </head>
      <body>
      ${body}
      </body>
      </html>`
  }
}

