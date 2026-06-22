#!/bin/bash

# this script takes all of the files in this directory and puts them into a json file to make emotes for the site.

output_file="emotes.json"
json_entries=()

while IFS= read -r -d $'\0' file_path; do
    filename=$(basename "$file_path")
    
    name="${filename%.*}"

    json_entries+=("  \"$name\": \"/emotes/$filename\"")
done < <(find . -maxdepth 1 -type f \( -iname "*.png" -o -iname "*.gif" -o -iname "*.jpg" -o -iname "*.jpeg" \) -print0)

printf "{\n" > "$output_file"

num_entries=${#json_entries[@]}
for i in "${!json_entries[@]}"; do
    printf "%s" "${json_entries[$i]}" >> "$output_file"
    if [[ $i -lt $((num_entries - 1)) ]]; then
        printf ",\n" >> "$output_file"
    else
        printf "\n" >> "$output_file"
    fi
done

printf "}\n" >> "$output_file"

echo "generated $output_file with $num_entries emotes."
