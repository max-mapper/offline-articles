var read = require('node-readability');
var request = require('request')
var run = require('run-series')
var cheerio = require('cheerio')
var path = require('path')
var url = require('url')
var concat = require('concat-stream')
var fs = require('fs')
var slugify = require('slugify')

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
          request(src)
          .on('error', cb)
        .pipe(concat(function (buff) {
            var dataUri = "data:application/octet-stream;base64," + buff.toString("base64")
            el.attr('src', dataUri)
            cb()
          }))
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
  request('https://archive.org/wayback/available?url=' + encodeURIComponent(page), {json: true}, function (err, resp, body) {
    if (err || resp.statusCode > 299) return cb(new Error('not cached in IA'))
    var snaps = body.archived_snapshots
    if (!snaps.closest || !snaps.closest.available) return cb(new Error('not cached in IA'))
    return cb(null, snaps.closest.url)
    
//    function archive () {
//      request('https://web.archive.org/save/' + page, function (err, resp, body) {
//        if (err || resp.statusCode > 299) return cb(new Error('could not get IA version'))
//        return cb(null, resp.request.uri)
//      })
//    }
  })
}

function get (page, cb) {
  getIA(page.url, function (err, archived) {
    if (err) {
      console.error(err.message, page.url)
      return getReadable(page.url)
    }
    getReadable(archived) 
  })
  function getReadable (href) {
    console.error('Getting readable', href)
  　read(href, {jar: true}, function (err, article, meta) {
      if (err) {
       cb(null, null)
       if (article) article.close()
       return console.error(page, err)
      }
      if (meta.statusCode > 299) {
        cb(null, null)
        if (article) article.close()
        return console.error(meta.statusCode, href)
      }
      article.url = href
      article.original = page.url
      article.file = page.file
      article.title = page.title
      cb(null, article)
    })
  }
}

function render (page) {
  var body = `<h3><a href="${page.url}">${page.title}</a></h3>
${page.inlined}<hr>`
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
        if (!page) return
        inlineImages(page, function (err, page) {
          if (err) return cb(err)
          render(page)
          setTimeout(cb, 0)
  　　　})
      })
    })
  })
  run(fns, function (err)　{
　　console.log('Done')
    if (err) console.error(err)
  })
})
