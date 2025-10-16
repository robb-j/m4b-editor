# m4b editor

This is a tool to generate iTunes-style audiobooks by combining multiple audio files into a single `.m4b` file with chapter metadata.

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
