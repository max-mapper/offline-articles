import sys
from newspaper import Article

url = sys.argv[1]
article = Article(url)
article.download()
article.parse()
print(article.text)


from newsplease import NewsPlease
article = NewsPlease.from_url(url)
print(article.text)
