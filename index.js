var read = require('node-readability');
var request = require('request')
var run = require('run-parallel')
var cheerio = require('cheerio')
var path = require('path')
var url = require('url')
var concat = require('concat-stream')

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
          console.error(el.attr('src'), src)
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

function get (page, cb) {
  read(page, function(err, article, meta) {
    if (err) {
     cb(null, null)
     if (article) article.close()
     return console.error(page, err)
    }
    article.url = page
    cb(null, article)
  })
}

function render (pages) {
  var body = ""
  pages.forEach(function (page) { 
    body += `<h3>${page.title}</h3>
${page.inlined}<hr>` 
  })

  var style = `<style type="text/css">
    body { 
      font-size: 19.125px;
      line-height: 30.6px;
      font-family: NYTImperial, nyt-imperial, georgia, "times new roman", times, serif;
    }
    img { max-width: 100%; }
  </style>`
  var tmp = `<html><head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" /></html>
    ${style}
    </head>
    <body>
    ${body}
    </body>
    </html>`
  console.log(tmp)
}


request('https://www.reddit.com/r/indepthstories.json', {json: true}, function (err, resp, json) {
  var fns = []
  json.data.children.forEach(function (ch) {
    var page = ch.data.url
    fns.push(function (cb) {
      get(page, function (err, page) {
        if (err) {
          err.page = page
          return cb(err)
        }
        if (!page) return cb()
        inlineImages(page, cb)
      })
    })
  })
  run(fns, function (err, results) {
    console.error(err)
    if (err) throw err
    results = results.filter(x => !!x)
    render(results)
  })
})
