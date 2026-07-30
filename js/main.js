// Data structure for characters
const characterData = {
    fnaf1: [
        {
            name: "Freddy Fazbear",
            description: "Freddy Fazbear is the titular main antagonist of Five Nights at Freddy's. He is an animatronic bear and the mascot of Freddy Fazbear's Pizza.",
            image: "assets/images/freddy.webp"
        },
        {
            name: "Bonnie",
            description: "Bonnie is an animatronic rabbit and children's entertainer housed at Freddy Fazbear's Pizza.",
            image: "assets/images/bonnie.webp"
        }
    ],
    fnaf2: [
        {
            name: "Toy Freddy",
            description: "Toy Freddy is an animatronic entertainer and the revamped version of Freddy Fazbear.",
            image: "assets/images/toy_freddy.webp"
        }
    ],
    fnaf3: [
        {
            name: "Springtrap",
            description: "Springtrap is the heavily damaged and withered form of Spring Bonnie, containing the corpse of William Afton.",
            image: "assets/images/springtrap.webp"
        }
    ],
    fnaf4: [
        {
            name: "Nightmare Fredbear",
            description: "Nightmare Fredbear is a terrifying, hallucinated version of Fredbear.",
            image: "assets/images/nightmare_fredbear.webp"
        }
    ]
};

function renderCharacters() {
    Object.keys(characterData).forEach(gameId => {
        const container = document.getElementById(`${gameId}-characters`);
        if (!container) return;

        characterData[gameId].forEach(char => {
            const charDiv = document.createElement('div');
            charDiv.className = 'character-entry';

            charDiv.innerHTML = `
                <div class="character-info">
                    <h3>${char.name}</h3>
                    <p>${char.description}</p>
                </div>
                <div class="character-image-container">
                    <img src="${char.image}" alt="${char.name}" class="character-image">
                </div>
            `;
            container.appendChild(charDiv);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    renderCharacters();
    console.log("FNAF-Verse Initialized");

    const nose = document.getElementById('freddy-nose');
    const landingPage = document.getElementById('landing-page');
    const jumpscareContainer = document.getElementById('jumpscare-container');
    const mainContent = document.getElementById('main-content');

    // Audio elements
    const honkSound = new Audio('assets/audio/honk.mp3');
    const jumpscareSound = new Audio('assets/audio/jumpscare.mp3');

    const ambientAudio = {
        'fnaf1-section': new Audio('assets/audio/ambience_fnaf1.mp3'),
        'fnaf2-section': new Audio('assets/audio/ambience_fnaf2.mp3'),
        'fnaf3-section': new Audio('assets/audio/ambience_fnaf3.mp3'),
        'fnaf4-section': new Audio('assets/audio/ambience_fnaf4.mp3')
    };

    // Configure ambient audio
    Object.values(ambientAudio).forEach(audio => {
        audio.loop = true;
        audio.volume = 0; // Start at volume 0 for fading
    });

    let currentActiveSectionId = null;

    nose.addEventListener('click', () => {
        // Play honk sound
        honkSound.play().catch(e => console.log('Audio play blocked or missing'));

        // Wait a short moment then jumpscare
        setTimeout(() => {
            triggerJumpscare();
        }, 1000);
    });

    function triggerJumpscare() {
        // Show jumpscare
        jumpscareContainer.classList.remove('hidden');
        jumpscareSound.play().catch(e => console.log('Audio play blocked or missing'));

        // Hide landing page
        landingPage.classList.add('hidden');

        // End jumpscare and show main content
        setTimeout(() => {
            jumpscareContainer.classList.add('hidden');
            mainContent.classList.remove('hidden');

            // Trigger initial scroll calculation for background
            handleScroll();
        }, 2000); // 2 second jumpscare
    }

    function fadeAudio(audioElement, targetVolume, duration) {
        if (!audioElement) return;
        const steps = 20;
        const stepTime = duration / steps;
        const volumeStep = (targetVolume - audioElement.volume) / steps;

        if (targetVolume > 0 && audioElement.paused) {
            audioElement.play().catch(e => console.log('Audio blocked', e));
        }

        let currentStep = 0;
        const interval = setInterval(() => {
            currentStep++;
            let newVolume = audioElement.volume + volumeStep;
            // Clamp volume
            if (newVolume < 0) newVolume = 0;
            if (newVolume > 1) newVolume = 1;

            audioElement.volume = newVolume;

            if (currentStep >= steps) {
                audioElement.volume = targetVolume;
                if (targetVolume === 0) {
                    audioElement.pause();
                }
                clearInterval(interval);
            }
        }, stepTime);
    }

    function switchAmbience(newSectionId) {
        if (currentActiveSectionId === newSectionId) return;

        if (currentActiveSectionId && ambientAudio[currentActiveSectionId]) {
            fadeAudio(ambientAudio[currentActiveSectionId], 0, 1000); // fade out over 1s
        }

        if (ambientAudio[newSectionId]) {
            fadeAudio(ambientAudio[newSectionId], 0.5, 1000); // fade in to 0.5 volume over 1s
        }

        currentActiveSectionId = newSectionId;
    }

    // Scroll Background Morphing
    const sections = document.querySelectorAll('.game-section');
    const bgStyleElement = document.createElement('style');
    document.head.appendChild(bgStyleElement);

    function handleScroll() {
        if (mainContent.classList.contains('hidden')) return;

        let currentSection = sections[0];

        // Find which section is most visible
        sections.forEach(section => {
            const rect = section.getBoundingClientRect();
            if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
                currentSection = section;
            }
        });

        const bgImage = currentSection.getAttribute('data-bg');
        // Update the pseudo-element background dynamically using a style tag
        bgStyleElement.innerHTML = `
            #main-content::before {
                background-image: url('${bgImage}');
            }
        `;

        switchAmbience(currentSection.id);
    }

    window.addEventListener('scroll', handleScroll);

    // Search functionality
    const searchInput = document.getElementById('character-search');
    const musicNotesContainer = document.getElementById('music-notes-container');
    let searchTimeout;

    // Music note animation symbols
    const notes = ['♪', '♫', '♩', '♬'];

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();

        // Spawn a music note
        if (e.target.value.length > 0) {
            const note = document.createElement('div');
            note.className = 'music-note';
            note.innerText = notes[Math.floor(Math.random() * notes.length)];

            // Random horizontal offset
            const offset = (Math.random() - 0.5) * 60;
            note.style.left = `calc(50% + ${offset}px)`;
            note.style.top = '-20px';

            // Random color tint
            const colors = ['#ff3333', '#33ff33', '#3333ff', '#ffff33'];
            note.style.color = colors[Math.floor(Math.random() * colors.length)];

            musicNotesContainer.appendChild(note);

            // Remove after animation finishes
            setTimeout(() => {
                note.remove();
            }, 1000);
        }

        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            if (!query) return;

            // Find the first character that matches
            const allCharElements = document.querySelectorAll('.character-entry');
            for (let charElement of allCharElements) {
                const name = charElement.querySelector('h3').innerText.toLowerCase();
                if (name.includes(query)) {
                    // Smooth scroll to the character
                    charElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

                    // Add a brief highlight effect
                    charElement.style.transition = 'box-shadow 0.5s';
                    charElement.style.boxShadow = '0 0 20px 5px rgba(255, 0, 0, 0.8)';
                    setTimeout(() => {
                        charElement.style.boxShadow = '';
                    }, 2000);
                    break; // Only scroll to the first match
                }
            }
        }, 500); // 500ms debounce
    });
});