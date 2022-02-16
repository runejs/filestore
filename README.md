[![RuneJS Discord Server](https://img.shields.io/discord/678751302297059336?label=RuneJS%20Discord&logo=discord)](https://discord.gg/5P74nSh)

[![RuneJS](https://i.imgur.com/QSXNzwC.png)](https://github.com/runejs/)

# FileStore

Node tools for managing and indexing the JS5 file store used with RuneJS.

## CLI Tools
_@todo work in progress_

- `index`
- `unpack`

## Archives
_@todo work in progress_

### JS5 // Game Version 400+

| Key | Name             | Description                  | File Extension | Game Version |
|-----|------------------|------------------------------|----------------|--------------|
| 255 | main             | Archive of Archives          |                | ^400         |
| 0   | anims            | Animation Sequences          |                | ^400         |
| 1   | bases            | Animation Base Files         |                | ^400         |
| 2   | config           | Game Configuration Files     |                | ^400         |
| 3   | interfaces       | Game Interfaces              |                | ^400         |
| 4   | synth_sounds     | Synthetic Game Sounds        | .wav           | ^400         |
| 5   | maps             | Game Map and Landscape Files |                | ^400         |
| 6   | midi_songs       | Midi Song Files              | .mid           | ^400         |
| 7   | models           | Game Model Files             |                | ^400         |
| 8   | sprites          | Sprite Packs (2D Images)     |                | ^400         |
| 9   | textures         | Game Texture Files           |                | ^400         |
| 10  | binary           | Miscellaneous Game Files     |                | ^400         |
| 11  | midi_jingles     | Shorter Midi Jingles         | .mid           | ^400         |
|     |                  |                              |                |              |
| 12  | clientscripts    | Client Script (CS2) Files    | .cs2           | ^435         |
| 13  | fontmetrics      | Game Fonts                   |                | ^443         |
| 14  | vorbis           | Player Script Variables      |                | ^451         |
| 15  | midi_instruments | Midi Song Instruments        |                | ^451         |
| 16  | config_loc       | Location Object Configs      |                | ^489         |
| 17  | config_enum      | Script Enum Configs          |                | ^489         |
| 18  | config_npc       | NPC Configs                  |                | ^489         |
| 19  | config_obj       | Item Configs                 |                | ^489         |
| 20  | config_seq       | Animation Sequence Configs   |                | ^489         |
| 21  | config_spot      | Spot Graphic Configs         |                | ^489         |
| 22  | config_var_bit   | VarBit Configs               |                | ^489         |
| 23  | worldmapdata     | Game World Map Data          |                | ^493         |
| 24  | quickchat        | Quickchat Dialogue           |                | ^498         |
| 25  | quickchat_global | Global Quickchat Dialogue    |                | ^498         |
| 26  | materials        | Game Material Data           |                | ^500         |
| 27  | config_particle  | Particle Configs             |                | ^523         |
| 28  | defaults         | Script Defaults              |                | ^537         |
