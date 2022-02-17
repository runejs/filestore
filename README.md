[![RuneJS Discord Server](https://img.shields.io/discord/678751302297059336?label=RuneJS%20Discord&logo=discord)](https://discord.gg/5P74nSh)

[![RuneJS](https://i.imgur.com/QSXNzwC.png)](https://github.com/runejs/)

# Store

Node tools for managing and indexing the JS5 file store used with RuneJS.

## CLI Tools
_@todo work in progress_

- `index`
- `unpack`

## Archives
_@todo work in progress_

### JS5 // Game Version 400+

|                               Key | Archive Name     | Content Description              | File Extensions |       Build       |
|----------------------------------:|:-----------------|:---------------------------------|:---------------:|:-----------------:|
| <sub><sup>idx</sup></sub> **255** | main             | Parent Archive of Archives 0-254 |                 | _400_<sup>+</sup> |
|                                   |                  |                                  |                 |                   |
|   <sub><sup>idx</sup></sub> **0** | anims            | Animation Sequences              |                 | _400_<sup>+</sup> |
|   <sub><sup>idx</sup></sub> **1** | bases            | Animation Base Files             |                 | _400_<sup>+</sup> |
|   <sub><sup>idx</sup></sub> **2** | config           | Game Configuration Files         |                 | _400_<sup>+</sup> |
|   <sub><sup>idx</sup></sub> **3** | interfaces       | Game Interfaces                  |                 | _400_<sup>+</sup> |
|   <sub><sup>idx</sup></sub> **4** | synth_sounds     | Synthetic Game Sounds            |      .wav       | _400_<sup>+</sup> |
|   <sub><sup>idx</sup></sub> **5** | maps             | Game Map and Landscape Files     |                 | _400_<sup>+</sup> |
|   <sub><sup>idx</sup></sub> **6** | midi_songs       | Midi Song Files                  |      .mid       | _400_<sup>+</sup> |
|   <sub><sup>idx</sup></sub> **7** | models           | Game Model Files                 |                 | _400_<sup>+</sup> |
|   <sub><sup>idx</sup></sub> **8** | sprites          | Sprite Packs (2D Images)         |                 | _400_<sup>+</sup> |
|   <sub><sup>idx</sup></sub> **9** | textures         | Game Texture Files               |                 | _400_<sup>+</sup> |
|  <sub><sup>idx</sup></sub> **10** | binary           | Miscellaneous Game Files         |                 | _400_<sup>+</sup> |
|  <sub><sup>idx</sup></sub> **11** | midi_jingles     | Shorter Midi Jingles             |      .mid       | _400_<sup>+</sup> |
|                                   |                  |                                  |                 |                   |
|  <sub><sup>idx</sup></sub> **12** | clientscripts    | Client Script (CS2) Files        |      .cs2       | _435_<sup>+</sup> |
|  <sub><sup>idx</sup></sub> **13** | fontmetrics      | Game Fonts                       |                 | _443_<sup>+</sup> |
|  <sub><sup>idx</sup></sub> **14** | vorbis           | Player Script Variables          |                 | _451_<sup>+</sup> |
|  <sub><sup>idx</sup></sub> **15** | midi_instruments | Midi Song Instruments            |                 | _451_<sup>+</sup> |
