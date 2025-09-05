// Wait for Spicetify to be available
(function waitForSpicetify() {
    if (!window.Spicetify || !Spicetify.Topbar || !Spicetify.Player) {
        setTimeout(waitForSpicetify, 100);
        return;
    }
    
    (function Spotistats() {
        let currentTrackStartTime = null;
        let currentTrackData = null;
        let statsData = {
            tracks: {},
            artists: {},
            albums: {},
            sessions: [],
            dailyStats: {},
            metadata: {
                version: "2.0.0",
                created: Date.now(),
                lastUpdated: Date.now(),
                totalPlaytime: 0,
                totalTracks: 0,
                migrationCompleted: false
            }
        };
        
        // Initialize JSON-based storage system
        async function initStorage() {
            try {
                // Load existing JSON data
                await loadStatsData();
                
                // Migrate from IndexedDB if needed
                if (!statsData.metadata.migrationCompleted) {
                    await migrateFromIndexedDB();
                }
                
                setupEventListeners();
                // Start tracking if there's already a song playing
                setTimeout(() => startTrackingCurrentSong(), 1000);
                
                // Set up periodic saves every 30 seconds
                setInterval(() => {
                    saveStatsData();
                }, 30000);
                
                // Save on page unload
                window.addEventListener('beforeunload', () => {
                    saveCurrentTrackProgress();
                    saveStatsData();
                });
                
                console.log("Spotistats: JSON storage system initialized");
            } catch (error) {
                console.error("Spotistats: Error initializing storage:", error);
            }
        }
        
        // Load stats data from localStorage
        async function loadStatsData() {
            try {
                const savedData = localStorage.getItem('spotistats_data_v2');
                if (savedData) {
                    const parsed = JSON.parse(savedData);
                    // Merge with default structure to handle version updates
                    statsData = {
                        ...statsData,
                        ...parsed,
                        metadata: {
                            ...statsData.metadata,
                            ...parsed.metadata,
                            lastUpdated: Date.now()
                        }
                    };
                    console.log("Spotistats: Loaded existing data with", Object.keys(statsData.tracks).length, "tracks");
                }
            } catch (error) {
                console.error("Spotistats: Error loading stats data:", error);
            }
        }
        
        // Save stats data to localStorage and create backup
        async function saveStatsData() {
            try {
                statsData.metadata.lastUpdated = Date.now();
                
                // Save main data
                localStorage.setItem('spotistats_data_v2', JSON.stringify(statsData));
                
                // Create daily backup
                const today = new Date().toISOString().split('T')[0];
                const backupKey = `spotistats_backup_${today}`;
                localStorage.setItem(backupKey, JSON.stringify({
                    date: today,
                    timestamp: Date.now(),
                    data: statsData
                }));
                
                // Clean old backups (keep last 7 days)
                cleanOldBackups();
                
                // Export to downloadable JSON for manual backup
                createExportableBackup();
                
            } catch (error) {
                console.error("Spotistats: Error saving stats data:", error);
            }
        }
        
        // Migrate existing data from IndexedDB
        async function migrateFromIndexedDB() {
            try {
                console.log("Spotistats: Starting migration from IndexedDB...");
                
                const request = indexedDB.open("SpotistatsDB", 1);
                
                request.onsuccess = async (event) => {
                    const db = event.target.result;
                    
                    try {
                        // Migrate tracks
                        const tracksData = await getIndexedDBData(db, "tracks");
                        tracksData.forEach(track => {
                            statsData.tracks[track.id] = {
                                id: track.id,
                                name: track.name,
                                plays: track.plays || 0,
                                minutes: track.minutes || 0,
                                lastPlayed: track.lastPlayed || Date.now(),
                                firstPlayed: track.firstPlayed || track.lastPlayed || Date.now(),
                                sessions: []
                            };
                        });
                        
                        // Migrate artists
                        const artistsData = await getIndexedDBData(db, "artists");
                        artistsData.forEach(artist => {
                            statsData.artists[artist.id] = {
                                id: artist.id,
                                name: artist.name,
                                plays: artist.plays || 0,
                                minutes: artist.minutes || 0,
                                lastPlayed: artist.lastPlayed || Date.now(),
                                firstPlayed: artist.firstPlayed || artist.lastPlayed || Date.now(),
                                topTracks: []
                            };
                        });
                        
                        // Migrate albums
                        const albumsData = await getIndexedDBData(db, "albums");
                        albumsData.forEach(album => {
                            statsData.albums[album.id] = {
                                id: album.id,
                                name: album.name,
                                plays: album.plays || 0,
                                minutes: album.minutes || 0,
                                lastPlayed: album.lastPlayed || Date.now(),
                                firstPlayed: album.firstPlayed || album.lastPlayed || Date.now()
                            };
                        });
                        
                        statsData.metadata.migrationCompleted = true;
                        await saveStatsData();
                        
                        console.log(`Spotistats: Migration completed! Migrated ${tracksData.length} tracks, ${artistsData.length} artists, ${albumsData.length} albums`);
                        
                    } catch (migrationError) {
                        console.error("Spotistats: Error during migration:", migrationError);
                        statsData.metadata.migrationCompleted = true; // Mark as completed to avoid retry loops
                    }
                };
                
                request.onerror = () => {
                    console.log("Spotistats: No existing IndexedDB found, starting fresh");
                    statsData.metadata.migrationCompleted = true;
                };
                
            } catch (error) {
                console.error("Spotistats: Error in migration process:", error);
                statsData.metadata.migrationCompleted = true;
            }
        }
        
        // Helper function to get data from IndexedDB
        function getIndexedDBData(db, storeName) {
            return new Promise((resolve, reject) => {
                try {
                    const transaction = db.transaction([storeName], "readonly");
                    const store = transaction.objectStore(storeName);
                    const request = store.getAll();
                    
                    request.onsuccess = () => resolve(request.result || []);
                    request.onerror = () => reject(request.error);
                } catch (error) {
                    resolve([]);
                }
            });
        }
        
        // Clean old backups
        function cleanOldBackups() {
            try {
                const keys = Object.keys(localStorage);
                const backupKeys = keys.filter(key => key.startsWith('spotistats_backup_'));
                
                if (backupKeys.length > 7) {
                    backupKeys.sort().slice(0, -7).forEach(key => {
                        localStorage.removeItem(key);
                    });
                }
            } catch (error) {
                console.error("Spotistats: Error cleaning old backups:", error);
            }
        }
        
        // Create exportable backup
        function createExportableBackup() {
            try {
                const exportData = {
                    exportDate: new Date().toISOString(),
                    version: statsData.metadata.version,
                    stats: statsData
                };
                
                localStorage.setItem('spotistats_export', JSON.stringify(exportData));
            } catch (error) {
                console.error("Spotistats: Error creating exportable backup:", error);
            }
        }

        // Set up event listeners
        function setupEventListeners() {
            try {
                if (!Spicetify?.Player) {
                    throw new Error("Spicetify.Player not available");
                }
                
                // Listen for song changes - start tracking new song
                Spicetify.Player.addEventListener("songchange", (event) => {
                    setTimeout(() => startTrackingCurrentSong(), 500);
                });
                
                // Listen for play/pause events
                Spicetify.Player.addEventListener("onplaypause", (event) => {
                    const isPaused = event?.data?.is_paused;
                    if (isPaused) {
                        // Song paused - save progress but don't reset tracking
                        saveCurrentTrackProgress(false);
                    } else {
                        // Song resumed - continue or restart tracking
                        setTimeout(() => startTrackingCurrentSong(), 500);
                    }
                });
            } catch (error) {
                console.error("Spotistats: Error setting up event listeners:", error);
            }
        }

        // Start tracking the current song
        function startTrackingCurrentSong() {
            try {
                const currentTrack = Spicetify?.Player?.data?.track || Spicetify?.Player?.data?.item;
                
                if (!currentTrack) {
                    return;
                }

                // If we were tracking a different song, save its progress first
                if (currentTrackData && currentTrackData.id !== currentTrack.uri) {
                    saveCurrentTrackProgress();
                }

                // Start tracking new song
                currentTrackStartTime = Date.now();
                currentTrackData = {
                    id: currentTrack.uri,
                    name: currentTrack.name,
                    artists: currentTrack.artists || [],
                    album: currentTrack.album,
                    duration: typeof currentTrack.duration === 'number' 
                        ? currentTrack.duration 
                        : (currentTrack.duration?.milliseconds || 0)
                };
            } catch (error) {
                console.error("Spotistats: Error starting track tracking:", error);
            }
        }

        // Save progress of currently tracked song
        function saveCurrentTrackProgress(resetTracking = true) {
            try {
                if (!currentTrackData || !currentTrackStartTime) {
                    return;
                }

                const listenTime = Date.now() - currentTrackStartTime;
                const listenTimeSeconds = listenTime / 1000;
                const listenTimeMinutes = listenTime / 60000;

                // Only count if listened for more than 20 seconds
                if (listenTimeSeconds < 20) {
                    if (resetTracking) {
                        currentTrackData = null;
                        currentTrackStartTime = null;
                    }
                    return;
                }

                // Cap the listen time to the song's actual duration
                const maxDurationMinutes = currentTrackData.duration / 60000;
                const actualListenMinutes = Math.min(listenTimeMinutes, maxDurationMinutes);

                // Save to JSON storage
                saveTrackStats(currentTrackData, actualListenMinutes);

                // Reset tracking only if requested (for song changes, not pauses)
                if (resetTracking) {
                    currentTrackData = null;
                    currentTrackStartTime = null;
                } else {
                    // For pauses, just reset the start time to continue tracking from now
                    currentTrackStartTime = Date.now();
                }
            } catch (error) {
                console.error("Spotistats: Error saving track progress:", error);
            }
        }

        // Save track statistics to JSON storage
        async function saveTrackStats(trackData, listenMinutes) {
            try {
                const timestamp = Date.now();
                const today = new Date().toISOString().split('T')[0];

                // Update track stats
                updateJSONStats("tracks", {
                    id: trackData.id,
                    name: trackData.name,
                    plays: 1,
                    minutes: listenMinutes,
                    lastPlayed: timestamp,
                    duration: trackData.duration
                });

                // Update artist stats
                for (const artist of trackData.artists) {
                    updateJSONStats("artists", {
                        id: artist.uri,
                        name: artist.name,
                        plays: 1,
                        minutes: listenMinutes,
                        lastPlayed: timestamp
                    });
                }

                // Update album stats
                if (trackData.album) {
                    updateJSONStats("albums", {
                        id: trackData.album.uri,
                        name: trackData.album.name,
                        plays: 1,
                        minutes: listenMinutes,
                        lastPlayed: timestamp
                    });
                }

                // Update daily stats
                if (!statsData.dailyStats[today]) {
                    statsData.dailyStats[today] = {
                        date: today,
                        tracks: 0,
                        minutes: 0,
                        uniqueTracks: new Set(),
                        uniqueArtists: new Set()
                    };
                }
                
                statsData.dailyStats[today].tracks += 1;
                statsData.dailyStats[today].minutes += listenMinutes;
                statsData.dailyStats[today].uniqueTracks.add(trackData.id);
                statsData.dailyStats[today].uniqueArtists.add(trackData.artists[0]?.uri);

                // Convert Sets to arrays for JSON serialization
                statsData.dailyStats[today].uniqueTracks = Array.from(statsData.dailyStats[today].uniqueTracks);
                statsData.dailyStats[today].uniqueArtists = Array.from(statsData.dailyStats[today].uniqueArtists);

                // Update metadata
                statsData.metadata.totalPlaytime += listenMinutes;
                statsData.metadata.totalTracks += 1;

                // Add session data
                statsData.sessions.push({
                    timestamp: timestamp,
                    trackId: trackData.id,
                    trackName: trackData.name,
                    artistName: trackData.artists[0]?.name || 'Unknown',
                    minutes: listenMinutes,
                    date: today
                });

                // Keep only last 1000 sessions to prevent excessive storage
                if (statsData.sessions.length > 1000) {
                    statsData.sessions = statsData.sessions.slice(-1000);
                }

            } catch (error) {
                console.error("Spotistats: Error saving track stats:", error);
            }
        }

        // Update stats in JSON storage
        function updateJSONStats(type, data) {
            try {
                if (!statsData[type][data.id]) {
                    statsData[type][data.id] = {
                        id: data.id,
                        name: data.name,
                        plays: 0,
                        minutes: 0,
                        firstPlayed: data.lastPlayed,
                        lastPlayed: data.lastPlayed
                    };
                }

                const existing = statsData[type][data.id];
                existing.plays += data.plays;
                existing.minutes += data.minutes;
                existing.lastPlayed = data.lastPlayed;
                existing.name = data.name; // Update name in case it changed

                // Add additional fields for tracks
                if (type === 'tracks' && data.duration) {
                    existing.duration = data.duration;
                }
            } catch (error) {
                console.error("Spotistats: Error updating JSON stats:", error);
            }
        }

        // Get stats from JSON storage
        function getStats(type, id) {
            try {
                if (id) {
                    return statsData[type][id] || null;
                } else {
                    return Object.values(statsData[type] || {});
                }
            } catch (error) {
                console.error("Spotistats: Error getting stats:", error);
                return id ? null : [];
            }
        }

        // Clear all stats
        function clearAllStats() {
            return new Promise((resolve) => {
                try {
                    statsData = {
                        tracks: {},
                        artists: {},
                        albums: {},
                        sessions: [],
                        dailyStats: {},
                        metadata: {
                            version: "2.0.0",
                            created: Date.now(),
                            lastUpdated: Date.now(),
                            totalPlaytime: 0,
                            totalTracks: 0,
                            migrationCompleted: true
                        }
                    };
                    
                    saveStatsData();
                    resolve();
                } catch (error) {
                    console.error("Spotistats: Error clearing stats:", error);
                    resolve();
                }
            });
        }

        // Export stats to downloadable file
        function exportStats() {
            try {
                const exportData = {
                    exportDate: new Date().toISOString(),
                    version: statsData.metadata.version,
                    stats: statsData
                };
                
                const dataStr = JSON.stringify(exportData, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);
                
                const link = document.createElement('a');
                link.href = url;
                link.download = `spotistats-export-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
                
                Spicetify.showNotification("Stats exported successfully!");
            } catch (error) {
                console.error("Spotistats: Error exporting stats:", error);
                Spicetify.showNotification("Error exporting stats", true);
            }
        }

        // Format items for display
        function formatTopItems(items) {
            if (!items?.length) {
                return "<p style='color: #888;'>No data available yet. Start playing some music!</p>";
            }

            return items
                .sort((a, b) => b.plays - a.plays)
                .slice(0, 10)
                .map((item, index) => `
                    <div style="margin: 8px 0; padding: 12px; border-bottom: 1px solid #444; background: #333; border-radius: 6px;">
                        <div style="display: flex; align-items: center; margin-bottom: 4px;">
                            <span style="color: #1db954; font-weight: bold; margin-right: 8px;">#${index + 1}</span>
                            <div style="font-weight: bold; color: white; flex: 1;">${item.name}</div>
                        </div>
                        <div style="color: #888; font-size: 13px;">
                            ${item.plays} plays • ${Math.round(item.minutes)} minutes
                            <br>
                            <small>Last played: ${new Date(item.lastPlayed).toLocaleString()}</small>
                        </div>
                    </div>
                `)
                .join("");
        }

        // Show stats modal
        async function showStatsModal() {
            try {
                const tracks = getStats("tracks");
                const artists = getStats("artists");
                const albums = getStats("albums");

                const totalMinutes = Math.round(statsData.metadata.totalPlaytime);
                const totalHours = Math.round(totalMinutes / 60);
                const totalDays = Math.round(totalHours / 24);

                const modalContent = document.createElement("div");
                modalContent.style.padding = "20px";
                modalContent.style.color = "white";
                modalContent.style.backgroundColor = "#282828";
                modalContent.innerHTML = `
                    <h2 style="margin-bottom: 20px; color: white;">Your Listening Stats</h2>
                    
                    <div style="display: flex; gap: 20px; margin-bottom: 20px; flex-wrap: wrap;">
                        <div style="background: #1db954; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px;">
                            <div style="font-size: 24px; font-weight: bold;">${Object.keys(statsData.tracks).length}</div>
                            <div style="font-size: 12px;">Total Tracks</div>
                        </div>
                        <div style="background: #1db954; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px;">
                            <div style="font-size: 24px; font-weight: bold;">${totalHours}h</div>
                            <div style="font-size: 12px;">Total Listening</div>
                        </div>
                        <div style="background: #1db954; padding: 15px; border-radius: 8px; text-align: center; min-width: 120px;">
                            <div style="font-size: 24px; font-weight: bold;">${Object.keys(statsData.artists).length}</div>
                            <div style="font-size: 12px;">Artists</div>
                        </div>
                    </div>
                    
                    <div style="margin-bottom: 20px;">
                        <button id="exportStatsBtn" style="background: #1db954; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-right: 10px;">
                            Export Data
                        </button>
                        <button id="clearStatsBtn" style="background: #e22134; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                            Clear All Stats
                        </button>
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px;">
                        <div>
                            <h3 style="color: white; margin-bottom: 10px;">Top Tracks (${tracks?.length || 0})</h3>
                            <div style="max-height: 400px; overflow-y: auto;">
                                ${formatTopItems(tracks?.slice(0, 10))}
                            </div>
                        </div>
                        <div>
                            <h3 style="color: white; margin-bottom: 10px;">Top Artists (${artists?.length || 0})</h3>
                            <div style="max-height: 400px; overflow-y: auto;">
                                ${formatTopItems(artists?.slice(0, 10))}
                            </div>
                        </div>
                        <div>
                            <h3 style="color: white; margin-bottom: 10px;">Top Albums (${albums?.length || 0})</h3>
                            <div style="max-height: 400px; overflow-y: auto;">
                                ${formatTopItems(albums?.slice(0, 10))}
                            </div>
                        </div>
                    </div>
                `;

                // Add event listeners
                setTimeout(() => {
                    const clearBtn = document.getElementById('clearStatsBtn');
                    const exportBtn = document.getElementById('exportStatsBtn');
                    
                    if (clearBtn) {
                        clearBtn.addEventListener('click', async () => {
                            if (confirm('Are you sure you want to clear all stats? This cannot be undone!')) {
                                await clearAllStats();
                                Spicetify.showNotification("All stats cleared");
                                Spicetify.PopupModal.hide();
                                setTimeout(() => showStatsModal(), 500);
                            }
                        });
                    }
                    
                    if (exportBtn) {
                        exportBtn.addEventListener('click', () => {
                            exportStats();
                        });
                    }
                }, 100);

                if (!Spicetify?.PopupModal) {
                    throw new Error("Spicetify.PopupModal not available");
                }

                Spicetify.PopupModal.display({
                    title: "Spotistats",
                    content: modalContent,
                    isLarge: true
                });
            } catch (error) {
                console.error("Spotistats: Error showing stats modal:", error);
                try {
                    Spicetify.showNotification(`Error: ${error.message}`, true);
                } catch (e) {
                    console.error("Spotistats: Could not show error notification:", e);
                }
            }
        }

        // Render the extension
        function render() {
            try {
                if (!Spicetify?.Topbar) {
                    throw new Error("Spicetify.Topbar not available");
                }

                // Create a properly styled button element
                const buttonElement = document.createElement("button");
                buttonElement.classList.add("main-topBar-button");
                buttonElement.setAttribute("data-encore-id", "buttonSecondary");
                buttonElement.innerHTML = `
                    <span class="ButtonInner-sc-14ud5tc-0 encore-bright-accent-set">
                        <svg role="img" height="16" width="16" viewBox="0 0 16 16" class="Svg-sc-ytk21e-0">
                            <path d="M15 2.75H1A.75.75 0 0 1 1 1.25h14a.75.75 0 0 1 0 1.5zm0 4H1a.75.75 0 0 1 0-1.5h14a.75.75 0 0 1 0 1.5zm0 4H1a.75.75 0 0 1 0-1.5h14a.75.75 0 0 1 0 1.5z"/>
                        </svg>
                        <span style="margin-left: 8px;">Stats</span>
                    </span>
                `;
                
                buttonElement.style.cssText = `
                    background: transparent;
                    border: none;
                    color: var(--spice-text);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-size: 14px;
                    font-weight: 400;
                    transition: background-color 0.2s ease;
                `;
                
                buttonElement.addEventListener('mouseenter', () => {
                    buttonElement.style.backgroundColor = 'var(--spice-button-hover)';
                });
                
                buttonElement.addEventListener('mouseleave', () => {
                    buttonElement.style.backgroundColor = 'transparent';
                });
                
                buttonElement.addEventListener('click', () => {
                    showStatsModal().catch(err => {
                        console.error("Spotistats: Error showing stats modal:", err);
                    });
                });

                // Add to topbar using the proper method
                const topbar = document.querySelector('.main-topBar-topbarContent');
                if (topbar) {
                    topbar.appendChild(buttonElement);
                } else {
                    // Fallback to Spicetify API
                    new Spicetify.Topbar.Button(
                        "Stats",
                        "chart-line",
                        () => {
                            showStatsModal().catch(err => {
                                console.error("Spotistats: Error showing stats modal:", err);
                            });
                        },
                        false
                    );
                }
            } catch (error) {
                console.error("Spotistats: Error rendering button:", error);
            }
        }

        // Initialize the extension
        try {
            initStorage();
            render();
        } catch (error) {
            console.error("Spotistats: Error initializing:", error);
        }
    })();
})();