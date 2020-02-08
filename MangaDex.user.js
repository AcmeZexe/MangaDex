// ==UserScript==
// @name        MangaDex list generator
// @namespace   AcmeZexe
// @version     1.1.8
// @description -
// @author      AcmeZexe
// @match       *://mangadex.*/title/*/chapters*
// @include     http*://mangadex.org/title/*/chapters
// @include     http*://mangadex.cc/title/*/chapters
// @grant       GM_setClipboard
// ==/UserScript==

(function(mangaURL) {
	"use strict";
	const mangaIDs = mangaURL.match(/\d+/);
	if (mangaIDs === null) {
		// UserScript's match/include matched a bad url
		const e = 'Please let the developers know: "mid_' + mangaURL + '"';
		console.error(e); alert(e); return;
	}

	if (!confirm("Download this manga?")) return;

	function sanitize(str) {
		var output = str.replace( // \x7F-\uFFFF
			/[\\\/?%*:|"<>\x00-\x1F]/g, '-'
		);
		while (output.indexOf("--") !== -1) { // remove consecutive '-'s
			output = output.replace(/-+/g, '-');
		}
		return output.trim();
	}

	var enChapters = [];
	fetch("//" + window.location.hostname + "/api/manga/" + mangaIDs[0])
	.then(r => r.json()).then(manga_body => {
		var fractional = 0;
		for (const ch in manga_body.chapter) {
			if (manga_body.chapter[ch].lang_code === "gb") {
				enChapters.push({...manga_body.chapter[ch], "chapter_id": ch});
				const chapterAsFloat = parseFloat(manga_body.chapter[ch].chapter);
				if (!isNaN(chapterAsFloat)) {
					const fr = (chapterAsFloat - (chapterAsFloat << 0));
					if (fr > fractional) fractional = fr;
				}
			}
		}

		const frLen = Math.log((fractional + "").split('.')[1]) * Math.LOG10E + 1 | 0;

		enChapters.forEach(chap => {
			let c = chap.chapter.split('.');
			if (c.length === 1) c[1] = '';
			chap.chapter = c[0].padStart(3, '0') + (frLen ? ('.' + c[1].padEnd(frLen, '0')) : '');
		});

		enChapters.sort((ch1, ch2) => { // TODO? oneshots
			let ch1c = parseFloat(ch1.chapter);
			if (isNaN(ch1c)) ch1c = 0; // oneshot
			let ch2c = parseFloat(ch2.chapter);
			if (isNaN(ch2c)) ch2c = 0; // oneshot

			//if (ch1c === ch2c) // multiple versions of the same chapter
			//	return ch1.group_id - ch2.group_id; // oldest groups first
			return ch1c - ch2c;
		});

		try {
			const chaptersInterval = (enChapters.length === 1) ?
				parseFloat(enChapters[0].chapter) :
				parseFloat(enChapters[0].chapter) + '-' + parseFloat(enChapters[enChapters.length-1].chapter)
			;
			let toDownload = prompt("Dowload (incl.)?", chaptersInterval);
			if (toDownload === null) return; // user cancelled

			if (toDownload.indexOf('-') !== -1) {
				toDownload = toDownload.split('-');
				if (toDownload.length === 2) { // found 2 values, can continue
					toDownload.map(v => parseFloat(v));
					if (!toDownload.some(isNaN)) { // parsed both, filter by these
						enChapters = enChapters.filter(chap =>
							parseFloat(chap.chapter) >= toDownload[0] &&
							parseFloat(chap.chapter) <= toDownload[1]
						);
					}
				}

			} else { // same logic, but on single value
				const only = parseFloat(toDownload);
				if (!isNaN(only)) { // parsed, filter by that
					enChapters = enChapters.filter(chap =>
						parseFloat(chap.chapter) == only
					);
				}
			}

		} catch (e) {
			// don't filter the chapters, download everything
		}

		const mangaTitle = sanitize(manga_body.manga.title).replace(/(^[.-]+)|([.-]+$)/, '');
		var pages = ""; // ~130% faster than array join
		enChapters.reduce(async (prevPromise, chap) => {
			await prevPromise;

			const dir = mangaTitle +
				"/c" + chap.chapter +
				(chap.title ? " " + sanitize(chap.title) : "") +
				" [" + sanitize(chap.group_name) + "]/"
			;
			return fetch("//" + window.location.hostname + "/api/chapter/" + chap.chapter_id)
			.then(r => r.json()).then(chapter_body => {
				const path = chapter_body.server + chapter_body.hash;
				chapter_body.page_array.forEach(pageFilename => {
					const file = pageFilename.split('.');
					if (file.length !== 2) {
						// pageFilename either doesn't have an extension,
						// or there are multiple dots
						const e = 'Please let the developers know: "pfn0_' + pageFilename + '"';
						console.error(e); alert(e); return;
					}
					// file[0] is the file's base name
					// file[1] is the extension

					const fn = file[0].match(/(\D+)?(\d+)(\D+)?/);
					if (fn === null || fn.length !== 4) {
						// base name does not comply to the standard? structure
						// [optional prefix][number][optional suffix]
						const e = 'Please let the developers know: "pfn1_' + file[0] + '"';
						console.error(e); alert(e); return;
					}
					if (fn[1] === undefined) fn[1] = '';
					if (fn[3] === undefined) fn[3] = '';
					// fn[1] is the prefix, if it exists
					// fn[2] is the page number
					// fn[3] is the suffix, if it exists

					pages +=
						// destination
						dir + fn[1] + fn[2].padStart(3, '0') + fn[3] + '.' + file[1]

						+ '\t' +

						// origin
						path + '/' + pageFilename

						+ '\n'
					;

				}); // foreach page_array
			}); // fetch chapter_body
		}, Promise.resolve()).then(()=> {
			if (confirm("Copy list to clipboard?")) {
				GM_setClipboard(pages);

			} else {
				window.location.replace(
					URL.createObjectURL(new Blob(
						[pages], {type: "text/plain"}
					))
				);
			}
		}); // resolve
	}); // fetch manga_body
})(window.location.href);
