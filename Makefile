.PHONY: site serve watch clean

# Build the static site into dist/.
site:
	python3 build.py

# Build, then serve dist/ locally.
serve: site
	cd dist && python3 -m http.server 8000 --bind 127.0.0.1

# Rebuild on any change to content, templates, styles, or config.
# Requires `entr` (https://eradman.com/entrproject/).
watch:
	find content templates styles.css site.yaml build.py | entr -r make site

clean:
	rm -rf dist
