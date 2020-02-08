#!/usr/bin/env sh

usage() {
	echo "Usage: $0 [FILE]..."
	exit
}

if [ -z "$1" ]; then
	>&2 echo "Missing argument: FILE"
	usage
fi

if [ $# -eq 1 ]; then
	case $1 in
		-h|--help) usage
		;;
	esac
fi

PATH=$PATH:.

for fn in "$@"; do
	echo "Parsing ${fn}"
	if ! [ -f "${fn}" ]; then
		>&2 echo "${fn}: File Not Found"

	else
		tmp="${fn}_$(date +%s.%N)" # create temporary file
		awk '{ sub("\r$", ""); print }' "${fn}" > ${tmp} # change line endings to LF
		#echo >> ${tmp}

		line=0
		while IFS=$'\t' read destination origin; do
			line=$((line+1))

			if [ -z "${destination}" ] && [ -z "${origin}" ]; then
				true #>&2 echo "${fn}:${line}: Empty Line. Skipping"

			elif [ -z "${destination}" ] || [ -z "${origin}" ]; then
				>&2 echo "${fn}:${line}: Malformed Line (not [destination]	[origin]). Skipping"

			elif ! [ -f "download/${destination}" ]; then
				curl --create-dirs -fSL "${origin}" -o "download/${destination}"

			fi
		done < "${tmp}"

		rm "${tmp}"
		echo "Parsed ${fn}"
	fi
done
