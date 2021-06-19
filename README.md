![RuneJS](https://i.imgur.com/pmkdSfc.png)

# RuneJS Filestore

[![RuneJS Discord Server](https://img.shields.io/discord/678751302297059336?label=RuneJS%20Discord&logo=discord)](https://discord.gg/5P74nSh)

Tools for managing the RuneScape indexed filestore used for RuneJS.

## File Stores

### Binary File Store

Holds miscellaneous binary files that don't fit into other filestores, including the game client title screen background image.

`BinaryStore` files are all named with their extensions included, if applicable.

### Configuration File Store

The `ConfigStore` contains various archives holding configuration files:

#### Item Store (Archive)

`ItemStore` holds files with game item data relevant to the game client.

#### NPC Store (Archive)

`NpcStore` files work similarly to `ItemStore`, but contain game NPC information instead.

#### Object Store (Archive)

`ObjectStore` files contain game object details. 

### Sound (wav) File Store

The `SoundStore` contains various `.wav` files for game sounds.

### Jingle (ogg) File Store

The `SoundStore` contains `.ogg` files for various minor game songs; level up songs, quest completion jingle, etc.

### Music (midi) File Store

`MusicStore` contains a list of `.mid` MIDI song files used to play game songs with a MIDI player.

Most MIDI files within the store have specific names that match the name of that song.

### Region Store

`RegionStore` files contain map tile and landscape object definitions for all game map regions.

These files are named with the format `m{regionX}_{regionY}` for map tile files and `l{regionX}_{regionY}` for landscape object files.

### Model Store
`ModelStore` contains information about individual game model files along with several rendering helper methods for implementing applications.

### Sprite Store

`SpriteStore` files are either single sprite/image, or archives of related game sprites. Files returned are of type `SpritePack`, which will contain one or more `Sprite` objects with indexed pixel data that can be converted directly to PNG format or base64 encoded via the included API.

### Game Interface Widget Store

`WidgetStore` files hold details on every different game interface widget that is available. Placement, type, options, sprites used, etc.
