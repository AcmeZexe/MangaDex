// ==UserScript==
// @name        MangaDex list generator
// @namespace   AcmeZexe
// @version     1.2.1
// @description -
// @author      AcmeZexe
// @match       *://mangadex.*/title/*/chapters*
// @include     http*://mangadex.org/title/*/chapters
// @include     http*://mangadex.cc/title/*/chapters
// @grant       GM_setClipboard
// ==/UserScript==

(function (mangaURL, useDefaults) {
	"use strict"

	const mangaIDs = mangaURL.match(/\d+/)
	if (mangaIDs === null) {
		// UserScript's match/include matched a bad url
		const e = 'Please let the developers know: "mid_' + mangaURL + '"'
		console.error(e)
		window.alert(e)
		return
	}

	if (!window.confirm("Download this manga?")) return

	var parser = new window.DOMParser
	function sanitize (str, removeDiacriticalMarks = true) {
		let output = parser.parseFromString(
			'<!doctype html><body>' + str.replace(/[<>]/g, '-'),
			'text/html'
		).body.textContent.replace( // \x7F-\uFFFF
			/[\\/?%*:|"\x00-\x1F]/g, '-'
		)
		if (removeDiacriticalMarks) {
			output = output.normalize("NFD").replace(/[\u0300-\u036f]/g, '')
		}
		while (output.indexOf("--") !== -1) { // remove consecutive '-'s
			output = output.replace(/-+/g, '-')
		}
		return output.trim()
	}

	useDefaults = !!useDefaults

	let showTitle = false
	let multipleGroups = false
	if (!useDefaults) {
		showTitle = !!window.confirm("Show chapters titles?")
		multipleGroups = !!window.confirm("Show multiple scanlators groups?")
	}

	window.fetch("//" + window.location.hostname + "/api/manga/" + mangaIDs[0])
	.then(r => r.json()).then(mangaObj => {
		const languages = []
		let downloadAllLanguages = false

		for (const ch in mangaObj.chapter) {
			if (languages.indexOf(mangaObj.chapter[ch].lang_code) === -1) {
				languages.push(mangaObj.chapter[ch].lang_code)
			}
		}
		if (!languages.length) {
			if (!useDefaults) {
				window.alert(
					'No languages available.\n' +
					'If this is wrong, please let the developers know: ' +
					'"nls_' + mangaIDs[0] + '"'
				)
				return
			}
			downloadAllLanguages = true
		}
		languages.sort()

		let userLangs = downloadAllLanguages ? '*' : window.prompt(
			"Languages? * = everything. Available: " + languages.join(','),
			useDefaults
				? ((languages.indexOf("gb") !== -1) ? "gb" : languages[0])
				: languages.join(',')
		)
		if (userLangs === null) return // user cancelled
		if (userLangs.length === 0) {
			userLangs = ['*']
		} else {
			userLangs = userLangs.replace(
				/[^*,a-z]/gi, ''
			).toLowerCase().split(',').sort()
		}
		let singleLanguage = (userLangs.length === 1)
		if (userLangs.indexOf('*') !== -1) {
			downloadAllLanguages = true
			singleLanguage = false
		}

		let Chapters = []
		{
			let integer = 0
			let decimal = 0
			for (const ch in mangaObj.chapter) {
				if (downloadAllLanguages ||
					(userLangs.indexOf(mangaObj.chapter[ch].lang_code) !== -1)
				) {
					Chapters.push({
						...mangaObj.chapter[ch],
						chapter_id: ch
					})
					const chapterAsFloat = parseFloat(
						mangaObj.chapter[ch].chapter
					)
					if (!isNaN(chapterAsFloat)) {
						if (chapterAsFloat > integer) integer = chapterAsFloat
						const frPart = (chapterAsFloat - (chapterAsFloat << 0))
						if (frPart > decimal) decimal = frPart
					}
				}
			}

			const nrOfDigits = n => (Math.log(n) * Math.LOG10E + 1 | 0)
			const integerLen = nrOfDigits(Math.ceil(integer))
			const decimalLen = nrOfDigits((decimal + '').split('.')[1])

			Chapters.forEach(chap => {
				const c = chap.chapter.split('.')
				if (c.length === 1) c[1] = ''
				chap.chapter = c[0].padStart(integerLen, '0') +
					(decimalLen ? ('.' + c[1].padEnd(decimalLen, '0')) : '')
			})
		}

		Chapters.sort((ch1, ch2) => { // TODO? oneshots
			let ch1c = parseFloat(ch1.chapter)
			if (isNaN(ch1c)) ch1c = 0 // oneshot
			let ch2c = parseFloat(ch2.chapter)
			if (isNaN(ch2c)) ch2c = 0 // oneshot

			//	if (ch1c === ch2c) // multiple versions of the same chapter
			//		return ch1.group_id - ch2.group_id // oldest groups first
			return ch1c - ch2c
		})

		try {
			const chaptersInterval = (Chapters.length === 1)
				? parseFloat(Chapters[0].chapter)
				: parseFloat(Chapters[0].chapter) + '-' +
					parseFloat(Chapters[Chapters.length - 1].chapter)
			let toDownload = window.prompt("Dowload (incl.)?", chaptersInterval)
			if (toDownload === null) return // user cancelled

			if (toDownload.indexOf('-') !== -1) {
				toDownload = toDownload.split('-')
				if (toDownload.length === 2) { // found 2 values, can continue
					toDownload.map(v => parseFloat(v))
					if (!toDownload.some(isNaN)) { // was able to parse both
						Chapters = Chapters.filter(c =>
							parseFloat(c.chapter) >= toDownload[0] &&
							parseFloat(c.chapter) <= toDownload[1]
						)
					}
				}
			} else { // same logic, but on single value
				const only = parseFloat(toDownload)
				if (!isNaN(only)) { // parsed, filter by that
					Chapters = Chapters.filter(c =>
						parseFloat(c.chapter) === only
					)
				}
			}
		} catch (e) {
			// don't filter the chapters, download everything
		}

		const mangaTitle = sanitize(mangaObj.manga.title).replace(
			/(^[.-]+)|([.-]+$)/, ''
		)
		let pages = '' // ~130% faster than array join
		Chapters.reduce(async (prevPromise, c) => {
			await prevPromise

			const chapterLang = (
				(!singleLanguage && c.lang_code) ? ' (' + c.lang_code + ')' : ''
			)
			const chapterTitle = (
				(showTitle && c.title) ? ' ' + sanitize(c.title) : ''
			)
			const otherGroups = (!multipleGroups ? '' : (
				(c.group_id_2 ? ", " + sanitize(c.group_name_2) : '') +
				(c.group_id_3 ? ", " + sanitize(c.group_name_3) : '')
			))
			const chapterGroups = (
				!(c.group_id + c.group_id_2 + c.group_id_3) ? ''
				: (' [' + sanitize(c.group_name) + otherGroups + ']')
			)
			const destinationFolder =
				mangaTitle +
				chapterLang +
				'/c' + c.chapter +
				chapterTitle +
				chapterGroups + '/'

			return window.fetch('//' +
				window.location.hostname + '/api/chapter/' + c.chapter_id
			).then(r => r.json()).then(chapterObj => {
				const path = chapterObj.server + chapterObj.hash
				chapterObj.page_array.forEach(pageFilename => {
					const file = pageFilename.split('.')
					if (file.length !== 2) {
						// pageFilename either doesn't have an extension,
						// or there are multiple dots
						const e = 'Please let the developers know: ' +
							'"pfn0_' + pageFilename + '"'
						console.error(e)
						window.alert(e)
						return
					}
					// file[0] is the file's base name
					// file[1] is the extension

					const fn = file[0].match(/(\D+)?(\d+)(\D+)?/)
					if (fn === null || fn.length !== 4) {
						// base name does not comply to the standard? structure
						// [optional prefix][number][optional suffix]
						const e = 'Please let the developers know: ' +
							'"pfn1_' + file[0] + '"'
						console.error(e)
						window.alert(e)
						return
					}
					if (fn[1] === undefined) fn[1] = ''
					if (fn[3] === undefined) fn[3] = ''
					// fn[1] is the prefix, if it exists
					// fn[2] is the page number
					// fn[3] is the suffix, if it exists

					const destinationFile =
						fn[1] + fn[2].padStart(3, '0') + fn[3] + '.' + file[1]

					pages +=
						// destination
						destinationFolder + destinationFile +

						'\t' +

						// origin
						path + '/' + pageFilename +

						'\n'
				}) // foreach page_array
			}) // fetch chapterObj
		}, Promise.resolve()).then(() => {
			if (window.confirm('Copy list to clipboard?')) {
				GM_setClipboard(pages)
			} else {
				window.location.replace(
					URL.createObjectURL(new window.Blob(
						[pages], { type: 'text/plain' }
					))
				)
			}
		}) // resolve
	}) // fetch mangaObj
})(window.location.href)
