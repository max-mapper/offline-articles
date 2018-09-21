# offline-articles

- given a feed of article URLs
- grabs latest version of html from electron window
- extracts just the article html using mozilla/readability
- fetches and inlines all images as data-uris (currently turned off)
- saves as an offline readable .html file
