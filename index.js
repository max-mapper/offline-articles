var read = require('node-readability');
var request = require('request')
var run = require('run-parallel')

function get (page, cb) {
  read(page, function(err, article, meta) {
    if (err) {
     cb(null, null)
     article.close()
     return
    }
    cb(null, article)
  })
}

function render (pages) {
  var body = ""
  pages.forEach(function (page) { 
    body += `<h3>${page.title}</h3>
${page.content}<hr>` 
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
      get(page, cb)
    })
  })
  run(fns, function (err, results) {
    if (err) throw err
    results = results.filter(x => !!x)
    render(results)
  })
})
