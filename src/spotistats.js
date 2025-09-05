// Wait for Spicetify to be available
(function waitForSpicetify() {
    if (!window.Spicetify || !Spicetify.Topbar || !Spicetify.Player) {
        setTimeout(waitForSpicetify, 100);
        return;
    }
    
    (function Spotistats() {
        let db = null;
        let currentTrackStartTime = null;
        let currentTrackData = null;
        
        // Initialize database
        function initDatabase() {
            const request = indexedDB.open("SpotistatsDB", 1);
            
            request.onerror = (event) => {
                console.error("Spotistats: Database error:", event);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores for different types of stats
                db.createObjectStore("tracks", { keyPath: "id" });
                db.createObjectStore("artists", { keyPath: "id" });
                db.createObjectStore("albums", { keyPath: "id" });
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                setupEventListeners();
                // Start tracking if there's already a song playing
                setTimeout(() => startTrackingCurrentSong(), 1000);
            };
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

                // Save to database
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

        // Save track statistics to database
        async function saveTrackStats(trackData, listenMinutes) {
            try {
                const timestamp = Date.now();

                // Update track stats
                await updateStats("tracks", {
                    id: trackData.id,
                    name: trackData.name,
                    plays: 1,
                    minutes: listenMinutes,
                    lastPlayed: timestamp
                });

                // Update artist stats
                for (const artist of trackData.artists) {
                    await updateStats("artists", {
                        id: artist.uri,
                        name: artist.name,
                        plays: 1,
                        minutes: listenMinutes,
                        lastPlayed: timestamp
                    });
                }

                // Update album stats
                if (trackData.album) {
                    await updateStats("albums", {
                        id: trackData.album.uri,
                        name: trackData.album.name,
                        plays: 1,
                        minutes: listenMinutes,
                        lastPlayed: timestamp
                    });
                }
            } catch (error) {
                console.error("Spotistats: Error saving track stats:", error);
            }
        }

        // Update stats in the database
        function updateStats(storeName, data) {
            return new Promise((resolve, reject) => {
                try {
                    if (!db) {
                        reject(new Error("Database not initialized"));
                        return;
                    }

                    const transaction = db.transaction([storeName], "readwrite");
                    const store = transaction.objectStore(storeName);

                    const request = store.get(data.id);
                    
                    request.onsuccess = () => {
                        const existing = request.result;
                        
                        if (existing) {
                            data.plays = (existing.plays || 0) + 1;
                            data.minutes = (existing.minutes || 0) + data.minutes;
                        }
                        
                        const putRequest = store.put(data);
                        putRequest.onsuccess = () => resolve();
                        putRequest.onerror = () => reject(putRequest.error);
                    };
                    
                    request.onerror = () => reject(request.error);
                } catch (error) {
                    reject(error);
                }
            });
        }

        // Get stats from the database
        function getStats(type, id) {
            return new Promise((resolve, reject) => {
                try {
                    if (!db) {
                        reject(new Error("Database not initialized"));
                        return;
                    }

                    const transaction = db.transaction([type], "readonly");
                    const store = transaction.objectStore(type);
                    
                    if (id) {
                        const request = store.get(id);
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    } else {
                        const request = store.getAll();
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = () => reject(request.error);
                    }
                } catch (error) {
                    reject(error);
                }
            });
        }

        // Clear all stats from the database
        function clearAllStats() {
            return new Promise((resolve, reject) => {
                try {
                    if (!db) {
                        reject(new Error("Database not initialized"));
                        return;
                    }

                    const transaction = db.transaction(["tracks", "artists", "albums"], "readwrite");
                    
                    transaction.objectStore("tracks").clear();
                    transaction.objectStore("artists").clear();
                    transaction.objectStore("albums").clear();
                    
                    transaction.oncomplete = () => resolve();
                    transaction.onerror = () => reject(transaction.error);
                } catch (error) {
                    reject(error);
                }
            });
        }

        // Format items for display
        function formatTopItems(items) {
            if (!items?.length) {
                return "<p style='color: #888;'>No data available yet. Start playing some music!</p>";
            }

            return items
                .sort((a, b) => b.plays - a.plays)
                .map(item => `
                    <div style="margin: 10px 0; padding: 10px; border-bottom: 1px solid #444; background: #333; border-radius: 4px;">
                        <div style="font-weight: bold; color: white;">${item.name}</div>
                        <div style="color: #888;">
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
                const [tracks, artists, albums] = await Promise.all([
                    getStats("tracks"),
                    getStats("artists"),
                    getStats("albums")
                ]);

                const modalContent = document.createElement("div");
                modalContent.style.padding = "20px";
                modalContent.style.color = "white";
                modalContent.style.backgroundColor = "#282828";
                modalContent.innerHTML = `
                    <h2 style="margin-bottom: 20px; color: white;">Your Listening Stats</h2>
                    <div style="margin-bottom: 20px;">
                        <button id="clearStatsBtn" style="background: #e22134; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
                            Clear All Stats
                        </button>
                    </div>
                    <h3 style="color: white;">Top Tracks (${tracks?.length || 0} total)</h3>
                    ${formatTopItems(tracks?.slice(0, 5))}
                    <h3 style="color: white;">Top Artists (${artists?.length || 0} total)</h3>
                    ${formatTopItems(artists?.slice(0, 5))}
                    <h3 style="color: white;">Top Albums (${albums?.length || 0} total)</h3>
                    ${formatTopItems(albums?.slice(0, 5))}
                `;

                // Add event listener for clear button
                setTimeout(() => {
                    const clearBtn = document.getElementById('clearStatsBtn');
                    
                    if (clearBtn) {
                        clearBtn.addEventListener('click', async () => {
                            if (confirm('Are you sure you want to clear all stats?')) {
                                await clearAllStats();
                                Spicetify.showNotification("All stats cleared");
                                // Close and reopen modal to refresh
                                Spicetify.PopupModal.hide();
                                setTimeout(() => showStatsModal(), 500);
                            }
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
            initDatabase();
            render();
        } catch (error) {
            console.error("Spotistats: Error initializing:", error);
        }
    })();
})();