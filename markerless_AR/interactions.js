// Plain-English names shown to the user instead of file names
const FURNITURE_LABELS = {
    'chair_1.glb': 'Classic Wooden Chair',
    'chair_2.glb': 'Weathered Rustic Chair',
    'chair_3.glb': 'Wooden Armchair',
    'chair_4.glb': 'Modern Accent Chair',
    'sofa_1.glb': 'Three-Seat Fabric Sofa',
    'sofa_2.glb': 'Dark Lounge Sofa',
    'cupboard_1.glb': 'Open Bookcase Cupboard',
    'table_1.glb': 'Gallinera Wooden Table'
};

const FURNITURE_DATA = {
    chair: [
        '../assets/models/chair/chair_1.glb',
        '../assets/models/chair/chair_2.glb',
        '../assets/models/chair/chair_3.glb',
        '../assets/models/chair/chair_4.glb'
    ],
    sofa: [
        '../assets/models/sofa/sofa_1.glb',
        '../assets/models/sofa/sofa_2.glb'
    ],
    cupboard: [
        '../assets/models/cupboard/cupboard_1.glb'
    ],
    table: [
        '../assets/models/table/table_1.glb'
    ]
};

function furnitureLabel(src) {
    const fileName = String(src).split('/').pop();
    return FURNITURE_LABELS[fileName] || fileName;
}

const MarkerlessState = {
    currentCategory: 'chair',
    currentIndex: 0,
    selectedModelPath: FURNITURE_DATA.chair[0],
    awaitingFloor: true,
    pickerOpen: false,
    floorAnchored: false
};

window.__markerlessGestureTarget = null;

function setMarkerlessGestureTarget(el) {
    window.__markerlessGestureTarget = el || null;
}

function getPlacedGroup() {
    return document.getElementById('placed-furniture-group');
}

function getPlacedItems() {
    const group = getPlacedGroup();
    return group ? group.querySelectorAll('.placed-furniture') : [];
}

function clearPlacedFurniture() {
    const group = getPlacedGroup();
    if (!group) return;
    while (group.firstChild) group.removeChild(group.firstChild);
    setMarkerlessGestureTarget(null);
}

function isArUiTouch(target) {
    return !!(target && target.closest && target.closest('#ar-ui, #selection-ui, button, a'));
}

// ==========================================
// 1. TOUCH GESTURES (ROTATE & SCALE)
// One window listener; only the selected placed piece moves.
// ==========================================
AFRAME.registerComponent('gesture-handler', {
    schema: {
        minScale: { default: 0.2 },
        maxScale: { default: 3.0 },
        rotationSensitivity: { default: 0.05 },
        placementMode: { default: false }
    },
    init: function () {
        this.touchState = {
            isDown: false,
            initialDistance: 0,
            initialScale: 0.6,
            lastX: 0
        };
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();

        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);

        window.addEventListener('touchstart', this.onTouchStart, { passive: false });
        window.addEventListener('touchmove', this.onTouchMove, { passive: false });
        window.addEventListener('touchend', this.onTouchEnd, { passive: false });
    },
    remove: function () {
        window.removeEventListener('touchstart', this.onTouchStart);
        window.removeEventListener('touchmove', this.onTouchMove);
        window.removeEventListener('touchend', this.onTouchEnd);
    },
    getTarget: function () {
        return window.__markerlessGestureTarget;
    },
    pickPlaced: function (clientX, clientY) {
        const camera = this.el.camera;
        const group = getPlacedGroup();
        if (!camera || !group || !group.object3D) return null;

        const canvas = this.el.canvas;
        const rect = canvas
            ? canvas.getBoundingClientRect()
            : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.pointer, camera);

        const hits = this.raycaster.intersectObjects(group.object3D.children, true);
        for (let i = 0; i < hits.length; i++) {
            let node = hits[i].object;
            while (node) {
                if (node.el && node.el.classList && node.el.classList.contains('placed-furniture')) {
                    return node.el;
                }
                node = node.parent;
            }
        }
        return null;
    },
    onTouchStart: function (e) {
        if (isArUiTouch(e.target)) return;
        if (MarkerlessState.pickerOpen) return;

        const point = e.touches && e.touches[0];
        if (point) {
            const hit = this.pickPlaced(point.clientX, point.clientY);
            if (hit) setMarkerlessGestureTarget(hit);
        }

        const target = this.getTarget();
        if (!target) return;

        if (e.touches.length === 1) {
            this.touchState.isDown = true;
            this.touchState.lastX = e.touches[0].clientX;
        } else if (e.touches.length === 2) {
            this.touchState.isDown = true;
            this.touchState.initialDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            this.touchState.initialScale = target.object3D.scale.x;
        }
    },
    onTouchMove: function (e) {
        const target = this.getTarget();
        if (!this.touchState.isDown || !target) return;

        e.preventDefault();

        if (e.touches.length === 1) {
            const deltaX = e.touches[0].clientX - this.touchState.lastX;
            target.object3D.rotation.y += deltaX * this.data.rotationSensitivity;
            this.touchState.lastX = e.touches[0].clientX;
        } else if (e.touches.length === 2) {
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            let newScale = this.touchState.initialScale * (currentDistance / this.touchState.initialDistance);
            newScale = Math.max(this.data.minScale, Math.min(this.data.maxScale, newScale));
            target.object3D.scale.set(newScale, newScale, newScale);
            target.setAttribute('scale', `${newScale} ${newScale} ${newScale}`);
        }
    },
    onTouchEnd: function (e) {
        if (e.touches.length === 0) {
            this.touchState.isDown = false;
        }
    }
});

// ==========================================
// 2. WEBXR HIT-TESTING & MULTI PLACEMENT
// ==========================================
function playPlacementSound() {
    const audio = document.getElementById('placement-sound');
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

function enableModelCastShadow(modelEl) {
    const apply = () => {
        modelEl.object3D.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = false;
            }
        });
    };
    modelEl.addEventListener('model-loaded', apply);
    if (modelEl.getObject3D('mesh')) apply();
}

function aimKeyLightAtFloor(position) {
    const keyLightEl = document.getElementById('key-light');
    if (!keyLightEl) return;

    keyLightEl.setAttribute('position', {
        x: position.x - 2.2,
        y: position.y + 4.5,
        z: position.z + 1.8
    });

    const light = keyLightEl.getObject3D('light');
    if (light && light.target) {
        light.target.position.set(position.x, position.y, position.z);
        light.target.updateMatrixWorld();
        if (!light.target.parent) {
            keyLightEl.object3D.parent.add(light.target);
        }
    }
}

function showShadowOnDetectedFloor(position) {
    const shadowFloor = document.getElementById('shadow-floor');
    if (!shadowFloor) return;
    if (!MarkerlessState.floorAnchored) {
        shadowFloor.setAttribute('position', {
            x: position.x,
            y: position.y + 0.003,
            z: position.z
        });
        MarkerlessState.floorAnchored = true;
    }
    shadowFloor.setAttribute('width', 8);
    shadowFloor.setAttribute('height', 8);
    shadowFloor.setAttribute('visible', true);
}

function hideShadowFloor() {
    const shadowFloor = document.getElementById('shadow-floor');
    if (shadowFloor) shadowFloor.setAttribute('visible', false);
    MarkerlessState.floorAnchored = false;
}

function updateMarkerlessHud() {
    const count = getPlacedItems().length;
    const countEl = document.getElementById('ml-placed-count');
    const placeBtn = document.getElementById('place-btn');
    const arrangeRow = document.getElementById('arrange-row');
    const gestureHint = document.getElementById('gesture-hint');
    const arGuide = document.getElementById('ar-guide');
    const picker = document.getElementById('ar-picker');
    const liveText = document.getElementById('live-pill-text');
    const undoBtn = document.getElementById('undo-last-btn');
    const resetRow = document.getElementById('reset-row');

    if (countEl) {
        countEl.hidden = count === 0 && MarkerlessState.awaitingFloor;
        if (count === 0) countEl.textContent = 'No furniture on the floor yet';
        else if (count === 1) countEl.textContent = '1 piece on the floor';
        else countEl.textContent = `${count} pieces on the floor`;
    }

    const picking = MarkerlessState.pickerOpen;
    const awaiting = MarkerlessState.awaitingFloor;

    if (placeBtn) placeBtn.hidden = !awaiting;
    if (arrangeRow) arrangeRow.hidden = awaiting || picking || count === 0;
    if (picker) picker.hidden = !picking;
    if (undoBtn) undoBtn.disabled = count === 0;
    if (resetRow) resetRow.hidden = count === 0 || picking;

    const guideTitle = document.getElementById('ar-guide-title');
    const guideText = document.getElementById('ar-guide-text');
    if (arGuide) {
        arGuide.style.display = awaiting ? 'block' : 'none';
        if (awaiting && count > 0) {
            if (guideTitle) guideTitle.textContent = 'Find an empty spot on the floor';
            if (guideText) guideText.innerHTML = 'Move the phone until the circle sits where you want the next piece. Then tap <strong>Place it here</strong>.';
        } else if (awaiting) {
            if (guideTitle) guideTitle.textContent = 'Move the phone slowly over the floor';
            if (guideText) guideText.innerHTML = 'Keep the floor in the picture. When a circle appears, tap <strong>Place it here</strong> and the furniture will stand on that spot.';
        }
    }
    if (gestureHint) {
        gestureHint.style.display = count > 0 && !awaiting ? 'block' : 'none';
    }
    if (liveText) {
        liveText.textContent = awaiting ? 'Finding the floor' : 'Camera on';
    }
}

AFRAME.registerComponent('ar-floor-shadows', {
    init: function () {
        const renderer = this.el.renderer;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
});

AFRAME.registerComponent('markerless-placement', {
    init: function () {
        this.xrHitTestSource = null;
        this.viewerSpace = null;
        this.refSpace = null;

        this.reticle = document.getElementById('reticle');
        this.placeBtn = document.getElementById('place-btn');
        this.addAnotherBtn = document.getElementById('add-another-btn');
        this.undoLastBtn = document.getElementById('undo-last-btn');
        this.pickerCancelBtn = document.getElementById('ar-picker-cancel');
        this.clearAllBtn = document.getElementById('clear-all-btn');
        this.newFloorBtn = document.getElementById('new-floor-btn');
        const sceneEl = this.el.sceneEl;

        this.hideReticle = () => {
            this.reticle.object3D.visible = false;
            this.reticle.setAttribute('visible', false);
        };

        this.placeModel = () => {
            if (!MarkerlessState.awaitingFloor) return;
            if (!this.reticle.object3D.visible) return;

            const group = getPlacedGroup();
            if (!group) return;

            const position = this.reticle.getAttribute('position');
            const clone = document.createElement('a-gltf-model');
            clone.classList.add('placed-furniture');
            clone.setAttribute('src', MarkerlessState.selectedModelPath);
            clone.setAttribute('position', `${position.x} ${position.y} ${position.z}`);
            clone.setAttribute('scale', '0.6 0.6 0.6');
            clone.setAttribute('shadow', 'cast: true; receive: false');
            group.appendChild(clone);
            enableModelCastShadow(clone);
            setMarkerlessGestureTarget(clone);

            showShadowOnDetectedFloor(position);
            aimKeyLightAtFloor(position);
            this.hideReticle();

            MarkerlessState.awaitingFloor = false;
            MarkerlessState.pickerOpen = false;
            updateMarkerlessHud();
            playPlacementSound();
        };

        this.undoLast = () => {
            const items = getPlacedItems();
            if (!items.length) return;
            const last = items[items.length - 1];
            if (window.__markerlessGestureTarget === last) setMarkerlessGestureTarget(null);
            last.parentNode.removeChild(last);

            const remaining = getPlacedItems();
            setMarkerlessGestureTarget(remaining.length ? remaining[remaining.length - 1] : null);

            if (!remaining.length) {
                hideShadowFloor();
                MarkerlessState.awaitingFloor = true;
                MarkerlessState.pickerOpen = false;
            }
            updateMarkerlessHud();
        };

        this.openPicker = () => {
            MarkerlessState.pickerOpen = true;
            MarkerlessState.awaitingFloor = true;
            if (typeof window.syncArPickerPreview === 'function') window.syncArPickerPreview();
            updateMarkerlessHud();
        };

        this.closePicker = () => {
            MarkerlessState.pickerOpen = false;
            MarkerlessState.awaitingFloor = false;
            this.hideReticle();
            updateMarkerlessHud();
        };

        this.startNewFloor = () => {
            clearPlacedFurniture();
            hideShadowFloor();
            MarkerlessState.pickerOpen = false;
            MarkerlessState.awaitingFloor = true;
            this.hideReticle();
            updateMarkerlessHud();
        };

        this.placeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.placeModel();
        });
        if (this.addAnotherBtn) {
            this.addAnotherBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openPicker();
            });
        }
        if (this.undoLastBtn) {
            this.undoLastBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.undoLast();
            });
        }
        if (this.pickerCancelBtn) {
            this.pickerCancelBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closePicker();
            });
        }
        if (this.clearAllBtn) {
            this.clearAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startNewFloor();
            });
        }
        if (this.newFloorBtn) {
            this.newFloorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.startNewFloor();
            });
        }

        sceneEl.renderer.xr.addEventListener('sessionstart', async () => {
            const session = sceneEl.renderer.xr.getSession();
            session.addEventListener('select', this.placeModel);

            MarkerlessState.awaitingFloor = true;
            MarkerlessState.pickerOpen = false;
            updateMarkerlessHud();

            try {
                this.viewerSpace = await session.requestReferenceSpace('viewer');
                this.xrHitTestSource = await session.requestHitTestSource({ space: this.viewerSpace });
            } catch (error) {
                console.error('Hit test setup failed:', error);
            }

            try {
                this.refSpace = await session.requestReferenceSpace('local-floor');
            } catch (error) {
                try {
                    this.refSpace = await session.requestReferenceSpace('local');
                } catch (fallbackError) {
                    console.error('Reference space setup failed:', fallbackError);
                }
            }
        });

        sceneEl.renderer.xr.addEventListener('sessionend', () => {
            this.xrHitTestSource = null;
            this.viewerSpace = null;
            this.refSpace = null;
            MarkerlessState.awaitingFloor = true;
            MarkerlessState.pickerOpen = false;
            this.hideReticle();
            clearPlacedFurniture();
            hideShadowFloor();
            updateMarkerlessHud();
        });
    },
    tick: function () {
        const sceneEl = this.el.sceneEl;
        if (!sceneEl.is('ar-mode') || !this.viewerSpace || !this.xrHitTestSource || !this.refSpace) return;

        if (!MarkerlessState.awaitingFloor) {
            this.reticle.object3D.visible = false;
            return;
        }

        const frame = sceneEl.frame;
        if (!frame) return;

        const xrViewerPose = frame.getViewerPose(this.refSpace);
        if (!xrViewerPose) return;

        const hitTestResults = frame.getHitTestResults(this.xrHitTestSource);
        if (hitTestResults.length > 0) {
            const pose = hitTestResults[0].getPose(this.refSpace);
            this.reticle.setAttribute('position', pose.transform.position);
            this.reticle.object3D.visible = true;
        } else {
            this.reticle.object3D.visible = false;
        }
    }
});

// ==========================================
// 3. UI SELECTION LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const categoryButtons = document.querySelectorAll('#selection-ui .category-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const modelPreviewText = document.getElementById('model-preview-text');
    const modelCounter = document.getElementById('model-counter');
    const arCategoryButtons = document.querySelectorAll('.ar-category-btn');
    const arPrevBtn = document.getElementById('ar-prev-btn');
    const arNextBtn = document.getElementById('ar-next-btn');
    const arModelPreviewText = document.getElementById('ar-model-preview-text');
    const arModelCounter = document.getElementById('ar-model-counter');
    const startArBtn = document.getElementById('start-ar-btn');
    const exitArBtn = document.getElementById('exit-ar-btn');
    const arStatus = document.getElementById('ar-status');
    const selectionUi = document.getElementById('selection-ui');
    const arUi = document.getElementById('ar-ui');
    const sceneEl = document.querySelector('a-scene');

    function updatePreview() {
        const modelsList = FURNITURE_DATA[MarkerlessState.currentCategory];
        MarkerlessState.selectedModelPath = modelsList[MarkerlessState.currentIndex];
        const label = furnitureLabel(MarkerlessState.selectedModelPath);
        const counter = modelsList.length > 1
            ? `Design ${MarkerlessState.currentIndex + 1} of ${modelsList.length}`
            : 'This is the only design';

        if (modelPreviewText) modelPreviewText.textContent = label;
        if (modelCounter) modelCounter.textContent = counter;
        if (arModelPreviewText) arModelPreviewText.textContent = label;
        if (arModelCounter) arModelCounter.textContent = counter;

        categoryButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-category') === MarkerlessState.currentCategory);
        });
        arCategoryButtons.forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-category') === MarkerlessState.currentCategory);
        });
    }

    window.syncArPickerPreview = updatePreview;

    function setCategory(category) {
        MarkerlessState.currentCategory = category;
        MarkerlessState.currentIndex = 0;
        updatePreview();
    }

    function showSelectionUi(message) {
        selectionUi.style.display = 'flex';
        arUi.style.display = 'none';
        if (message) {
            arStatus.textContent = message;
            arStatus.classList.add('is-error');
        }
    }

    async function checkWebXrSupport() {
        if (!window.isSecureContext) {
            return 'This page needs a secure (https) link to use the camera. Please open the https address for RoomView.';
        }
        if (!navigator.xr) {
            return 'This browser cannot place furniture on the floor. Please open the page in Chrome on an Android phone, or go back and choose “Scan a printed picture”.';
        }
        try {
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!supported) {
                return 'This phone cannot place furniture on the floor. You can still scan a printed picture from the home page.';
            }
        } catch (error) {
            return 'We could not check this phone. Try tapping Open my camera anyway.';
        }
        return null;
    }

    categoryButtons.forEach((button) => {
        button.addEventListener('click', (e) => {
            setCategory(e.currentTarget.getAttribute('data-category'));
        });
    });
    arCategoryButtons.forEach((button) => {
        button.addEventListener('click', (e) => {
            setCategory(e.currentTarget.getAttribute('data-category'));
        });
    });

    function goNext() {
        const modelsList = FURNITURE_DATA[MarkerlessState.currentCategory];
        MarkerlessState.currentIndex = (MarkerlessState.currentIndex + 1) % modelsList.length;
        updatePreview();
    }

    function goPrev() {
        const modelsList = FURNITURE_DATA[MarkerlessState.currentCategory];
        MarkerlessState.currentIndex = (MarkerlessState.currentIndex - 1 + modelsList.length) % modelsList.length;
        updatePreview();
    }

    nextBtn.addEventListener('click', goNext);
    prevBtn.addEventListener('click', goPrev);
    if (arNextBtn) arNextBtn.addEventListener('click', goNext);
    if (arPrevBtn) arPrevBtn.addEventListener('click', goPrev);

    updatePreview();

    checkWebXrSupport().then((message) => {
        if (message) {
            arStatus.textContent = message;
            arStatus.classList.add('is-error');
        }
    });

    async function startAr() {
        const supportMessage = await checkWebXrSupport();
        if (supportMessage) {
            arStatus.textContent = supportMessage;
            arStatus.classList.add('is-error');
            return;
        }

        MarkerlessState.awaitingFloor = true;
        MarkerlessState.pickerOpen = false;
        clearPlacedFurniture();
        selectionUi.style.display = 'none';
        arUi.style.display = 'block';
        updateMarkerlessHud();

        const enterAr = () => {
            sceneEl.enterVR(true).catch((error) => {
                console.error('Failed to start AR session:', error);
                showSelectionUi('We could not open the camera. Tap Allow when your phone asks, then try again.');
            });
        };

        if (sceneEl.hasLoaded) {
            enterAr();
        } else {
            sceneEl.addEventListener('loaded', enterAr, { once: true });
        }
    }

    startArBtn.addEventListener('click', startAr);

    exitArBtn.addEventListener('click', () => {
        if (sceneEl.is('ar-mode')) {
            sceneEl.exitVR();
        } else {
            showSelectionUi();
        }
    });

    sceneEl.addEventListener('exit-vr', () => {
        showSelectionUi();
        arStatus.textContent = 'Ready when you are. Chrome on an Android phone works best.';
        arStatus.classList.remove('is-error');
        clearPlacedFurniture();
        hideShadowFloor();
        MarkerlessState.awaitingFloor = true;
        MarkerlessState.pickerOpen = false;
        updateMarkerlessHud();
    });
});
