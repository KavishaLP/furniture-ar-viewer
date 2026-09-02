// ==========================================
// 1. TOUCH GESTURES (ROTATE & SCALE)
// ==========================================
AFRAME.registerComponent('gesture-handler', {
    schema: {
        minScale: { default: 0.2 },
        maxScale: { default: 3.0 },
        rotationSensitivity: { default: 0.05 }
    },
    init: function () {
        this.touchState = {
            isDown: false,
            initialDistance: 0,
            initialScale: 0.6,
            lastX: 0
        };

        const canvas = this.el.sceneEl.canvas;

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.touchState.isDown = true;
                this.touchState.lastX = e.touches[0].clientX;
            } else if (e.touches.length === 2) {
                this.touchState.isDown = true;
                this.touchState.initialDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                this.touchState.initialScale = this.el.object3D.scale.x;
            }
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            if (!this.touchState.isDown) return;

            if (e.touches.length === 1) {
                const deltaX = e.touches[0].clientX - this.touchState.lastX;
                this.el.object3D.rotation.y += deltaX * this.data.rotationSensitivity;
                this.touchState.lastX = e.touches[0].clientX;
            } else if (e.touches.length === 2) {
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const scaleFactor = currentDistance / this.touchState.initialDistance;
                let newScale = this.touchState.initialScale * scaleFactor;
                newScale = Math.max(this.data.minScale, Math.min(this.data.maxScale, newScale));
                this.el.object3D.scale.set(newScale, newScale, newScale);
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                this.touchState.isDown = false;
            }
        });
    }
});

// ==========================================
// 2. AUTO-DETECT TARGET & MODEL SWAPPING
// ==========================================
function initMarkerUi() {
    const furnitureData = {
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

    const categoryIndices = { chair: 0, sofa: 0, cupboard: 0, table: 0 };
    let activeCategory = null;

    const detectedLabel = document.getElementById('detected-category');
    const modelStatus = document.getElementById('model-status');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const prevBtnMobile = document.getElementById('prev-btn-mobile');
    const nextBtnMobile = document.getElementById('next-btn-mobile');
    const targetEntities = document.querySelectorAll('[mindar-image-target]');

    function getActiveModel() {
        if (!activeCategory) return null;
        const target = document.querySelector(`[mindar-image-target][data-category="${activeCategory}"]`);
        return target ? target.querySelector('.furniture-model') : null;
    }

    function updateStatusText() {
        if (!activeCategory) {
            modelStatus.textContent = 'Waiting for marker…';
            return;
        }
        const modelsList = furnitureData[activeCategory];
        const fileName = modelsList[categoryIndices[activeCategory]].split('/').pop();
        modelStatus.textContent = `${activeCategory} · ${fileName}`;
    }

    function updateModel() {
        const model = getActiveModel();
        if (!model || !activeCategory) return;
        const modelsList = furnitureData[activeCategory];
        model.setAttribute('src', modelsList[categoryIndices[activeCategory]]);
        updateStatusText();
    }

    function setActiveCategory(category) {
        activeCategory = category;
        detectedLabel.textContent = category;
        detectedLabel.classList.add('active');
        updateModel();
    }

    function clearCategory() {
        activeCategory = null;
        detectedLabel.textContent = 'Scan a marker to begin';
        detectedLabel.classList.remove('active');
        modelStatus.textContent = 'Waiting for marker…';
    }

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
}

document.addEventListener('DOMContentLoaded', () => {
    const sceneEl = document.querySelector('a-scene');
    if (sceneEl.hasLoaded) {
        initMarkerUi();
    } else {
        sceneEl.addEventListener('loaded', initMarkerUi, { once: true });
    }
});
