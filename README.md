# m4b editor

This is a tool to generate iTunes-style audiobooks by combining multiple audio files into a single `.m4b` file with chapter metadata.

**instructions**

1. Add the audio files you want to combine together. They should already be tagged with their title/album/artist and at least one should have a cover artwork
2. Pick advanced options such as the audio codec, sample rate, bit rate or bit depth
3. Pick "for iPod" to solve some AAC audio codec issues on iPods
4. Press run and wait for it to be generated

**process**

1. Each audio file is scanned by `ffmpeg` to get each track title, album, composer, date and cover art.
2. The first found cover art is used and displayed when you attach the files
3. The tracks are sorted in alphabetical order
4. All the files are joined into a single file using the desired codec and any advanced options set
5. Each track's duration & title are used to generate chapters metadata
6. The first found `album` name is used as the name track `title` and generated filename
7. The first found cover art, `artist`, `composer` & `date` are applied
8. The metadata and artwork are applied to the generated file

**dependencies**

This is static HTML file but it imports:

- [FFMpeg](https://github.com/ffmpegwasm/ffmpeg.wasm)
- [Alembic Labcoat](https://alembic.openlab.dev/labcoat/)
- [Rubik font](https://fonts.openlab.dev)

**commands**

```sh

touch list.txt # fill with files to concatenate
touch metadata.ini # add tags + chapter info

# Convert a file to AAC
ffmpeg -i $NAME.m4a -codec:a aac 08.aac

# Combine files together into a single one
ffmpeg -f concat -safe 0 -i list.txt -codec:a aac all.m4a

# Apply cover art + metadata
ffmpeg -i all.m4a -i cover.jpg -i metadata.ini -map 0:a -map 1 -c copy -disposition:1 attached_pic -map_metadata 2 output.m4b
```

links

- https://hhsprings.bitbucket.io/docs/programming/examples/ffmpeg/metadata/chapters.html
- `aac_pns` https://www.reddit.com/r/ipod/comments/gfl7na/ipod_mini_annoying_audio_artifacts/
