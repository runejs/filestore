[![RuneJS Discord Server](https://img.shields.io/discord/678751302297059336?label=RuneJS%20Discord&logo=discord)](https://discord.gg/5P74nSh)

[![RuneJS](https://i.imgur.com/QSXNzwC.png)](https://github.com/runejs/)

# Filestore

Tools for managing the RuneScape indexed filestore used with RuneJS.

## Archives

### Binary

Holds miscellaneous binary files that don't fit into other archives, including the game client title screen background image.

`BinaryStore` files are all named with their extensions included, if applicable.

### Config

The `ConfigStore` contains various archives holding configuration files:

#### Item Configs

`ItemStore` holds files with game item data relevant to the game client.

#### NPC Configs

`NpcStore` files work similarly to `ItemStore`, but contain game NPC information instead.

#### Object Configs

`ObjectStore` files contain game object details. 

### Sounds (.wav)

The `SoundStore` contains various `.wav` files for game sounds.

### Jingles (.ogg)

The `SoundStore` contains `.ogg` files for various minor game songs; level up songs, quest completion jingle, etc.

### Music (.midi)

`MusicStore` contains a list of `.mid` MIDI song files used to play game songs with a MIDI player.

Most MIDI files within the store have specific names that match the name of that song.

### Regions

`RegionStore` files contain map tile and landscape object definitions for all game map regions.

These files are named with the format `m{regionX}_{regionY}` for map tile files and `l{regionX}_{regionY}` for landscape object files.

### Models

`ModelStore` contains information about individual game model files along with several rendering helper methods for implementing applications.

### Sprites

`SpriteStore` files are either single sprite/image, or archives of related game sprites. Files returned are of type `SpritePack`, which will contain one or more `Sprite` objects with indexed pixel data that can be converted directly to PNG format or base64 encoded via the included API.

### UI Interfaces

`WidgetStore` files hold details on every different game interface widget that is available. Placement, type, options, sprites used, etc.
