# Spotistats

A Spicetify extension that tracks your Spotify listening statistics with real-time monitoring and accurate play counting.

## Features

- **Real-time tracking**: Monitors your listening habits as you play music
- **Smart counting**: Only counts songs listened to for more than 20 seconds
- **Accurate minutes**: Tracks actual listening time, not full song duration
- **Comprehensive stats**: View statistics for tracks, artists, and albums
- **Local storage**: All data is stored locally in your browser
- **Clean interface**: Integrated seamlessly into Spotify's UI

## Screenshots

The extension adds a "Stats" button to your Spotify top bar that opens a modal showing your listening statistics.

## Installation

### Prerequisites

You need to have [Spicetify](https://spicetify.app/) installed and configured on your system.

### macOS

1. **Install Spicetify** (if not already installed):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/spicetify/spicetify-cli/master/install.sh | sh
   ```

2. **Download this extension**:
   ```bash
   cd ~/.config/spicetify/Extensions
   git clone https://github.com/yourusername/spotistats.git
   ```

3. **Install the extension**:
   ```bash
   spicetify config extensions spotistats.js
   spicetify apply
   ```

### Windows

1. **Install Spicetify** (if not already installed):
   ```powershell
   iwr -useb https://raw.githubusercontent.com/spicetify/spicetify-cli/master/install.ps1 | iex
   ```

2. **Download this extension**:
   ```powershell
   cd $env:APPDATA\spicetify\Extensions
   git clone https://github.com/yourusername/spotistats.git
   ```

3. **Install the extension**:
   ```powershell
   spicetify config extensions spotistats.js
   spicetify apply
   ```

### Linux

1. **Install Spicetify** (if not already installed):
   ```bash
   curl -fsSL https://raw.githubusercontent.com/spicetify/spicetify-cli/master/install.sh | sh
   ```

2. **Download this extension**:
   ```bash
   cd ~/.config/spicetify/Extensions
   git clone https://github.com/yourusername/spotistats.git
   ```

3. **Install the extension**:
   ```bash
   spicetify config extensions spotistats.js
   spicetify apply
   ```

## Manual Installation

If you prefer to install manually:

1. **Download the files**:
   - Download `manifest.json` and the `src/` folder
   - Place them in your Spicetify Extensions directory

2. **Find your Extensions directory**:
   - **macOS/Linux**: `~/.config/spicetify/Extensions/`
   - **Windows**: `%APPDATA%\spicetify\Extensions\`

3. **Create a folder** called `spotistats` and place the files inside

4. **Enable the extension**:
   ```bash
   spicetify config extensions spotistats.js
   spicetify apply
   ```

## Usage

1. **Start Spotify** with Spicetify applied
2. **Look for the "Stats" button** in the top bar
3. **Click the button** to view your listening statistics
4. **Listen to music** - the extension will automatically track your listening habits

### How it works

- **Tracking starts** when you play a song
- **Only counts** songs you listen to for more than 20 seconds
- **Tracks actual time** listened, not full song duration
- **Saves progress** when you pause, skip, or change songs
- **Accumulates statistics** for tracks, artists, and albums

## Data Storage

All your listening data is stored locally in your browser's IndexedDB. No data is sent to external servers.

## Troubleshooting

### Extension not showing up
- Make sure Spicetify is properly installed and applied
- Check that the extension files are in the correct directory
- Try running `spicetify apply` again

### Stats not tracking
- Open browser developer tools (F12) and check the console for errors
- Make sure you're listening to songs for more than 20 seconds
- Try restarting Spotify

### Clear all data
Use the "Clear All Stats" button in the stats modal to reset all your data.

## Development

The extension is built with vanilla JavaScript and uses:
- **IndexedDB** for local data storage
- **Spicetify APIs** for Spotify integration
- **Real-time event listeners** for tracking

## Contributing

Feel free to open issues or submit pull requests to improve the extension.

## License

MIT License - feel free to use and modify as needed.

## Author

Created by Rudy Dena