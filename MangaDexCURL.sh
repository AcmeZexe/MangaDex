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
		while IFS=$'\t' read filename location; do
			line=$((line+1))

			if [ -z "${filename}" ] && [ -z "${location}" ]; then
				true #>&2 echo "${fn}:${line}: Empty Line. Skipping"

			elif [ -z "${filename}" ] || [ -z "${location}" ]; then
				>&2 echo "${fn}:${line}: Malformed Line. Skipping"

			elif ! [ -f "download/${filename}" ]; then
				curl --create-dirs -fSL "${location}" -o "download/${filename}"

			fi
		done < "${tmp}"

		rm "${tmp}"
		echo "Parsed ${fn}"
	fi
done
