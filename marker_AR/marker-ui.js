// Plain-English names shown to the user instead of file names
const FURNITURE_LABELS = {
    'chair_1.glb': 'Classic Wooden Chair',
    'chair_2.glb': 'Weathered Rustic Chair',
    'chair_3.glb': 'Wooden Armchair',
    'sofa_1.glb': 'Three-Seat Fabric Sofa',
    'sofa_2.glb': 'Dark Lounge Sofa',
    'cupboard_1.glb': 'Open Bookcase Cupboard',
    'table_1.glb': 'Gallinera Wooden Table'
};

const CATEGORY_LABELS = {
    chair: 'Chair',
    sofa: 'Sofa',
    cupboard: 'Cupboard',
    table: 'Table'
};

function furnitureLabel(src) {
    const fileName = String(src).split('/').pop();
    return FURNITURE_LABELS[fileName] || fileName;
}

// ==========================================
// SHARED STATE
// Preview = model attached to a tracked marker.
// Selected = a placed copy the user tapped.
// ==========================================
const MarkerState = {
    previewModel: null,
    selectedModel: null,
    onSelectionChange: null
};

function isUiControl(target) {
    return !!(target && target.closest && target.closest('button, a, .ar-top-bar, .marker-model-nav, .marker-place-row, .marker-select-panel, .help-sheet'));
}

// ==========================================
// 1. TAP TO SELECT · DRAG TO MOVE · PINCH TO SCALE
// ==========================================
AFRAME.registerComponent('furniture-manipulator', {
    schema: {
        minScale: { default: 0.15 },
        maxScale: { default: 2.5 },
        rotationSensitivity: { default: 0.06 }
    },
    init: function () {
        this.raycaster = new THREE.Raycaster();
        this.pointer = new THREE.Vector2();
        this.dragPlane = new THREE.Plane();
        this.dragOffset = new THREE.Vector3();
        this.hitPoint = new THREE.Vector3();
        this.camDir = new THREE.Vector3();
        this.objWorldPos = new THREE.Vector3();

        this.mode = null; // 'drag' | 'scale' | 'rotate-preview'
        this.startDistance = 0;
        this.startScale = 1;
        this.lastX = 0;
        this.movedDistance = 0;
        this.downPoint = { x: 0, y: 0 };

        this.selectionBox = null;
        this.lastTouchTime = 0;
        this.placedGroup = document.getElementById('placed-furniture-group');

        this.onDown = this.onDown.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onUp = this.onUp.bind(this);

        window.addEventListener('touchstart', this.onDown, { passive: false });
        window.addEventListener('touchmove', this.onMove, { passive: false });
        window.addEventListener('touchend', this.onUp);
        window.addEventListener('mousedown', this.onDown);
        window.addEventListener('mousemove', this.onMove);
        window.addEventListener('mouseup', this.onUp);
    },
    remove: function () {
        window.removeEventListener('touchstart', this.onDown);
        window.removeEventListener('touchmove', this.onMove);
        window.removeEventListener('touchend', this.onUp);
        window.removeEventListener('mousedown', this.onDown);
        window.removeEventListener('mousemove', this.onMove);
        window.removeEventListener('mouseup', this.onUp);
    },
    // Mobile browsers replay a mouse event pair after every tap; ignore those
    isSyntheticMouse: function (e) {
        if (e.type.startsWith('touch')) {
            this.lastTouchTime = Date.now();
            return false;
        }
        return this.lastTouchTime && Date.now() - this.lastTouchTime < 800;
    },
    setPointer: function (clientX, clientY) {
        const canvas = this.el.canvas;
        const rect = canvas
            ? canvas.getBoundingClientRect()
            : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
        this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    },
    pickPlaced: function (clientX, clientY) {
        const camera = this.el.camera;
        if (!camera || !this.placedGroup) return null;

        this.setPointer(clientX, clientY);
        this.raycaster.setFromCamera(this.pointer, camera);

        const hits = this.raycaster.intersectObjects(this.placedGroup.object3D.children, true);
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
    beginDrag: function (el, clientX, clientY) {
        const camera = this.el.camera;
        el.object3D.getWorldPosition(this.objWorldPos);
        camera.getWorldDirection(this.camDir);
        this.dragPlane.setFromNormalAndCoplanarPoint(this.camDir, this.objWorldPos);

        this.setPointer(clientX, clientY);
        this.raycaster.setFromCamera(this.pointer, camera);
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) {
            this.dragOffset.copy(this.objWorldPos).sub(this.hitPoint);
        } else {
            this.dragOffset.set(0, 0, 0);
        }
        this.mode = 'drag';
    },
    dragTo: function (clientX, clientY) {
        const el = MarkerState.selectedModel;
        if (!el) return;

        this.setPointer(clientX, clientY);
        this.raycaster.setFromCamera(this.pointer, this.el.camera);
        if (!this.raycaster.ray.intersectPlane(this.dragPlane, this.hitPoint)) return;

        this.hitPoint.add(this.dragOffset);
        const local = el.object3D.parent.worldToLocal(this.hitPoint.clone());
        el.object3D.position.copy(local);
        el.setAttribute('position', `${local.x} ${local.y} ${local.z}`);
    },
    applyScale: function (el, newScale) {
        const clamped = Math.max(this.data.minScale, Math.min(this.data.maxScale, newScale));
        el.object3D.scale.set(clamped, clamped, clamped);
        el.setAttribute('scale', `${clamped} ${clamped} ${clamped}`);
    },
    onDown: function (e) {
        if (isUiControl(e.target) || this.isSyntheticMouse(e)) return;

        const touches = e.touches;
        this.movedDistance = 0;

        if (touches && touches.length === 2) {
            const target = MarkerState.selectedModel || MarkerState.previewModel;
            if (!target) return;
            this.mode = 'scale';
            this.scaleTarget = target;
            this.startDistance = Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY
            );
            this.startScale = target.object3D.scale.x;
            return;
        }

        const point = touches && touches.length ? touches[0] : e;
        if (point.clientX === undefined) return;

        this.downPoint = { x: point.clientX, y: point.clientY };
        this.lastX = point.clientX;

        const hit = this.pickPlaced(point.clientX, point.clientY);
        if (hit) {
            selectPlacedModel(hit);
            this.beginDrag(hit, point.clientX, point.clientY);
            return;
        }

        if (MarkerState.selectedModel) {
            this.beginDrag(MarkerState.selectedModel, point.clientX, point.clientY);
            this.mode = 'drag-pending';
            return;
        }

        if (MarkerState.previewModel) {
            this.mode = 'rotate-preview';
        }
    },
    onMove: function (e) {
        if (!this.mode) return;

        const touches = e.touches;

        if (this.mode === 'scale' && touches && touches.length === 2) {
            e.preventDefault();
            const distance = Math.hypot(
                touches[0].clientX - touches[1].clientX,
                touches[0].clientY - touches[1].clientY
            );
            this.applyScale(this.scaleTarget, this.startScale * (distance / this.startDistance));
            return;
        }

        const point = touches && touches.length ? touches[0] : e;
        if (point.clientX === undefined) return;

        this.movedDistance = Math.hypot(point.clientX - this.downPoint.x, point.clientY - this.downPoint.y);

        if (this.mode === 'drag-pending' && this.movedDistance > 10) {
            this.mode = 'drag';
        }

        if (this.mode === 'drag') {
            e.preventDefault();
            this.dragTo(point.clientX, point.clientY);
            return;
        }

        if (this.mode === 'rotate-preview' && MarkerState.previewModel) {
            e.preventDefault();
            const deltaX = point.clientX - this.lastX;
            MarkerState.previewModel.object3D.rotation.y += deltaX * this.data.rotationSensitivity;
            this.lastX = point.clientX;
        }
    },
    onUp: function (e) {
        const stillTouching = e.touches && e.touches.length > 0;
        if (stillTouching) return;

        // Tap on empty space deselects
        if (this.mode === 'drag-pending' && this.movedDistance < 10) {
            selectPlacedModel(null);
        }

        this.mode = null;
        this.scaleTarget = null;
    },
    showSelectionBox: function (el) {
        this.hideSelectionBox();
        if (!el) return;

        // The helper needs real geometry, so wait for the glTF when it is still loading
        const build = () => {
            if (MarkerState.selectedModel !== el) return;
            if (new THREE.Box3().setFromObject(el.object3D).isEmpty()) return;
            this.hideSelectionBox();
            this.selectionBox = new THREE.BoxHelper(el.object3D, 0xe94560);
            this.selectionBox.material.depthTest = false;
            this.selectionBox.material.transparent = true;
            this.el.object3D.add(this.selectionBox);
        };
        build();
        el.addEventListener('model-loaded', build, { once: true });
    },
    hideSelectionBox: function () {
        if (!this.selectionBox) return;
        this.el.object3D.remove(this.selectionBox);
        this.selectionBox.geometry.dispose();
        this.selectionBox.material.dispose();
        this.selectionBox = null;
    },
    tick: function () {
        if (this.selectionBox && MarkerState.selectedModel) {
            this.selectionBox.update();
        }
    }
});

// Selection is shared between the manipulator and the UI layer
function selectPlacedModel(el) {
    if (MarkerState.selectedModel === el) {
        if (MarkerState.onSelectionChange) MarkerState.onSelectionChange(el);
        return;
    }
    MarkerState.selectedModel = el || null;

    const sceneEl = document.querySelector('a-scene');
    const manipulator = sceneEl && sceneEl.components['furniture-manipulator'];
    if (manipulator) manipulator.showSelectionBox(MarkerState.selectedModel);

    if (MarkerState.onSelectionChange) MarkerState.onSelectionChange(MarkerState.selectedModel);
}

// ==========================================
// 2. SCAN → PLACE → MOVE / REMOVE → ADD MORE
// ==========================================
function initMarkerUi() {
    const furnitureData = {
        chair: [
            '../assets/models/chair/chair_1.glb',
            '../assets/models/chair/chair_2.glb',
            '../assets/models/chair/chair_3.glb'
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

    const categoryIndices = { chair: 0, sofa: 0, cupboard: 0, table: 0 };
    let activeCategory = null;
    let roomMode = false;

    const sceneEl = document.querySelector('a-scene');
    const detectedLabel = document.getElementById('detected-category');
    const modelStatus = document.getElementById('model-status');
    const placedCountEl = document.getElementById('placed-count');
    const hintText = document.getElementById('ar-hint-text');
    const placeBtn = document.getElementById('place-btn');
    const undoBtn = document.getElementById('undo-btn');
    const clearBtn = document.getElementById('clear-btn');
    const doneBtn = document.getElementById('done-btn');
    const addMoreBtn = document.getElementById('add-more-btn');
    const newFloorBtn = document.getElementById('new-floor-btn');
    const scanControls = document.getElementById('scan-controls');
    const roomControls = document.getElementById('room-controls');
    const selectPanel = document.getElementById('select-panel');
    const selectedLabel = document.getElementById('selected-label');
    const rotateLeftBtn = document.getElementById('rotate-left-btn');
    const rotateRightBtn = document.getElementById('rotate-right-btn');
    const removeBtn = document.getElementById('remove-btn');
    const deselectBtn = document.getElementById('deselect-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const prevBtnMobile = document.getElementById('prev-btn-mobile');
    const nextBtnMobile = document.getElementById('next-btn-mobile');
    const targetEntities = document.querySelectorAll('[mindar-image-target]');
    const placedGroup = document.getElementById('placed-furniture-group');

    function getPreviewModel(category) {
        if (!category) return null;
        const target = document.querySelector(`[mindar-image-target][data-category="${category}"]`);
        return target ? target.querySelector('.furniture-model') : null;
    }

    function getPlacedItems() {
        return placedGroup.querySelectorAll('.placed-furniture');
    }

    function updatePlacedCount() {
        const count = getPlacedItems().length;
        if (count === 0) {
            placedCountEl.textContent = 'No furniture kept yet';
        } else if (count === 1) {
            placedCountEl.textContent = '1 piece kept in your room';
        } else {
            placedCountEl.textContent = `${count} pieces kept in your room`;
        }
        undoBtn.disabled = count === 0;
        clearBtn.disabled = count === 0;
        doneBtn.disabled = count === 0;
    }

    function updateHint() {
        if (MarkerState.selectedModel) {
            hintText.textContent = 'Drag to slide it · pinch to resize · Turn to spin it';
        } else if (roomMode) {
            hintText.textContent = 'Tap a piece to move, turn or remove it';
        } else if (activeCategory) {
            hintText.textContent = 'Happy with this one? Tap “Keep this piece”';
        } else {
            hintText.textContent = 'Point the camera at a printed picture';
        }
    }

    function updateStatusText() {
        if (!activeCategory) {
            modelStatus.textContent = 'Waiting for a picture…';
            return;
        }
        const modelsList = furnitureData[activeCategory];
        const index = categoryIndices[activeCategory];
        const name = furnitureLabel(modelsList[index]);
        modelStatus.textContent = modelsList.length > 1
            ? `${name} · ${index + 1} of ${modelsList.length}`
            : name;
    }

    function updateModel() {
        const model = getPreviewModel(activeCategory);
        if (!model || !activeCategory) return;
        const modelsList = furnitureData[activeCategory];
        model.setAttribute('src', modelsList[categoryIndices[activeCategory]]);
        updateStatusText();
    }

    function resetPreview(model) {
        if (!model) return;
        model.setAttribute('position', '0 0 0.1');
        model.setAttribute('rotation', '0 0 0');
        model.setAttribute('scale', '0.6 0.6 0.6');
        model.object3D.rotation.set(0, 0, 0);
        model.object3D.scale.set(0.6, 0.6, 0.6);
    }

    function setActiveCategory(category) {
        if (roomMode) return;

        activeCategory = category;
        MarkerState.previewModel = getPreviewModel(category);
        selectPlacedModel(null);

        detectedLabel.textContent = `${CATEGORY_LABELS[category] || category} picture found`;
        detectedLabel.classList.add('active');
        placeBtn.disabled = false;

        if (MarkerState.previewModel) {
            MarkerState.previewModel.setAttribute('visible', true);
        }
        updateModel();
        updateHint();
    }

    function clearCategory() {
        activeCategory = null;
        MarkerState.previewModel = null;
        detectedLabel.textContent = 'Point the camera at a picture';
        detectedLabel.classList.remove('active');
        modelStatus.textContent = 'Waiting for a picture…';
        placeBtn.disabled = true;
        updateHint();
    }

    // ---- Room preview: camera stays on, marker scanning stops ----
    function hideAllPreviews() {
        document.querySelectorAll('.furniture-model').forEach((model) => {
            model.setAttribute('visible', false);
        });
    }

    function setScannerOverlayVisible(visible) {
        const scanning = document.querySelector('.mindar-ui-scanning');
        if (scanning) scanning.classList.toggle('hidden', !visible);

        // The loading spinner is only ever hidden by us, never re-shown
        if (!visible) {
            const loading = document.querySelector('.mindar-ui-loading');
            if (loading) loading.classList.add('hidden');
        }
    }

    function setScanningActive(active) {
        const system = sceneEl.systems && sceneEl.systems['mindar-image-system'];
        if (!system) return;
        try {
            if (active) {
                system.unpause();
            } else {
                // keepVideo: true → camera feed keeps running, tracking stops
                system.pause(true);
            }
        } catch (err) {
            console.warn('MindAR scanning toggle failed:', err);
        }
    }

    function enterRoomMode() {
        if (!getPlacedItems().length) return;
        roomMode = true;

        setScanningActive(false);
        setScannerOverlayVisible(false);
        hideAllPreviews();
        activeCategory = null;
        MarkerState.previewModel = null;

        document.body.classList.add('room-mode');
        scanControls.hidden = true;
        roomControls.hidden = false;
        detectedLabel.textContent = 'Looking at your room';
        detectedLabel.classList.add('active');
        updateHint();
    }

    function exitRoomMode() {
        roomMode = false;

        setScanningActive(true);
        setScannerOverlayVisible(true);
        document.body.classList.remove('room-mode');
        scanControls.hidden = false;
        roomControls.hidden = true;
        clearCategory();
    }

    function startNewFloor() {
        clearAll();
        exitRoomMode();
    }

    function placeFurniture() {
        const preview = MarkerState.previewModel;
        if (!preview || !activeCategory) return;

        preview.object3D.updateWorldMatrix(true, false);
        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        preview.object3D.getWorldPosition(worldPos);
        preview.object3D.getWorldQuaternion(worldQuat);
        preview.object3D.getWorldScale(worldScale);

        // Nudge each new item sideways so stacked copies stay distinguishable
        const offsetStep = 0.18 * getPlacedItems().length;
        worldPos.x += offsetStep;

        const euler = new THREE.Euler().setFromQuaternion(worldQuat, 'YXZ');
        const src = preview.getAttribute('src');

        const clone = document.createElement('a-gltf-model');
        clone.classList.add('placed-furniture');
        clone.dataset.label = furnitureLabel(src);
        clone.setAttribute('src', src);
        clone.setAttribute('position', `${worldPos.x} ${worldPos.y} ${worldPos.z}`);
        clone.setAttribute('rotation', `${THREE.MathUtils.radToDeg(euler.x)} ${THREE.MathUtils.radToDeg(euler.y)} ${THREE.MathUtils.radToDeg(euler.z)}`);
        clone.setAttribute('scale', `${worldScale.x} ${worldScale.y} ${worldScale.z}`);
        placedGroup.appendChild(clone);

        const applyWorldPose = () => {
            clone.object3D.position.copy(worldPos);
            clone.object3D.quaternion.copy(worldQuat);
            clone.object3D.scale.copy(worldScale);
        };
        clone.addEventListener('loaded', () => {
            applyWorldPose();
            selectPlacedModel(clone);
        });
        applyWorldPose();

        preview.setAttribute('visible', false);
        resetPreview(preview);
        updatePlacedCount();
        selectPlacedModel(clone);

        detectedLabel.textContent = 'Kept in your room ✓';
        detectedLabel.classList.remove('active');
        modelStatus.textContent = 'Scan another picture to add the next piece';
        placeBtn.disabled = true;
        activeCategory = null;
        MarkerState.previewModel = null;
    }

    function undoLast() {
        const items = getPlacedItems();
        if (!items.length) return;
        const last = items[items.length - 1];
        if (MarkerState.selectedModel === last) selectPlacedModel(null);
        last.parentNode.removeChild(last);
        updatePlacedCount();
    }

    function removeSelected() {
        const selected = MarkerState.selectedModel;
        if (!selected) return;
        selectPlacedModel(null);
        selected.parentNode.removeChild(selected);
        updatePlacedCount();

        // Nothing left to preview — go back to scanning
        if (roomMode && !getPlacedItems().length) exitRoomMode();
    }

    function clearAll() {
        selectPlacedModel(null);
        getPlacedItems().forEach((item) => item.parentNode.removeChild(item));
        updatePlacedCount();
    }

    function rotateSelected(degrees) {
        const selected = MarkerState.selectedModel;
        if (!selected) return;
        selected.object3D.rotation.y += THREE.MathUtils.degToRad(degrees);
        const rotation = selected.object3D.rotation;
        selected.setAttribute('rotation', {
            x: THREE.MathUtils.radToDeg(rotation.x),
            y: THREE.MathUtils.radToDeg(rotation.y),
            z: THREE.MathUtils.radToDeg(rotation.z)
        });
    }

    MarkerState.onSelectionChange = (el) => {
        selectPanel.hidden = !el;
        if (el) selectedLabel.textContent = el.dataset.label || 'This piece';
        updateHint();
    };

    targetEntities.forEach((target) => {
        target.addEventListener('targetFound', () => {
            setActiveCategory(target.getAttribute('data-category'));
        });

        target.addEventListener('targetLost', () => {
            if (activeCategory === target.getAttribute('data-category')) {
                clearCategory();
            }
        });
    });

    function goNext() {
        if (!activeCategory) return;
        const modelsList = furnitureData[activeCategory];
        categoryIndices[activeCategory] = (categoryIndices[activeCategory] + 1) % modelsList.length;
        updateModel();
    }

    function goPrev() {
        if (!activeCategory) return;
        const modelsList = furnitureData[activeCategory];
        categoryIndices[activeCategory] = (categoryIndices[activeCategory] - 1 + modelsList.length) % modelsList.length;
        updateModel();
    }

    nextBtn.addEventListener('click', goNext);
    prevBtn.addEventListener('click', goPrev);
    nextBtnMobile.addEventListener('click', goNext);
    prevBtnMobile.addEventListener('click', goPrev);
    placeBtn.addEventListener('click', placeFurniture);
    undoBtn.addEventListener('click', undoLast);
    clearBtn.addEventListener('click', clearAll);
    removeBtn.addEventListener('click', removeSelected);
    deselectBtn.addEventListener('click', () => selectPlacedModel(null));
    rotateLeftBtn.addEventListener('click', () => rotateSelected(-22.5));
    rotateRightBtn.addEventListener('click', () => rotateSelected(22.5));
    doneBtn.addEventListener('click', enterRoomMode);
    addMoreBtn.addEventListener('click', exitRoomMode);
    newFloorBtn.addEventListener('click', startNewFloor);

    updatePlacedCount();
}

// The instructions sheet works on its own, before the AR scene is ready
function initHelpSheet() {
    const sheet = document.getElementById('help-sheet');
    const openBtn = document.getElementById('help-open-btn');
    const closeBtn = document.getElementById('help-close-btn');
    if (!sheet || !openBtn || !closeBtn) return;

    openBtn.addEventListener('click', () => { sheet.hidden = false; });
    closeBtn.addEventListener('click', () => { sheet.hidden = true; });
}

document.addEventListener('DOMContentLoaded', () => {
    initHelpSheet();

    const sceneEl = document.querySelector('a-scene');
    if (sceneEl.hasLoaded) {
        initMarkerUi();
    } else {
        sceneEl.addEventListener('loaded', initMarkerUi, { once: true });
    }
});
