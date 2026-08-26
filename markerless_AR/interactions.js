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
        this.touchState = { isDown: false, initialDistance: 0, initialScale: 0.6, lastX: 0 };
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
                let newScale = this.touchState.initialScale * (currentDistance / this.touchState.initialDistance);
                newScale = Math.max(this.data.minScale, Math.min(this.data.maxScale, newScale));
                this.el.object3D.scale.set(newScale, newScale, newScale);
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) this.touchState.isDown = false;
        });
    }
});

// ==========================================
// 2. WEBXR HIT-TESTING & PLACEMENT LOGIC
// ==========================================
AFRAME.registerComponent('markerless-placement', {
    init: function () {
        this.xrHitTestSource = null;
        this.viewerSpace = null;
        this.refSpace = null;
        
        this.reticle = document.getElementById('reticle');
        this.placedModel = document.getElementById('placed-model');
        const placeBtn = document.getElementById('place-btn');
        const sceneEl = this.el.sceneEl;

        // Core placement logic to run when button is clicked OR screen is tapped
        const placeModel = () => {
            if (this.reticle.object3D.visible) {
                const position = this.reticle.getAttribute('position');
                
                // Set precise position
                this.placedModel.setAttribute('position', { x: position.x, y: position.y, z: position.z });
                
                // FIX: Scale the model up to visible size (0.6) since we started it at 0 to force loading
                this.placedModel.setAttribute('scale', '0.6 0.6 0.6');
                this.placedModel.object3D.visible = true;
            }
        };

        // 1. Try to place via the HTML Button
        placeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop click from firing twice
            placeModel();
        });

        sceneEl.renderer.xr.addEventListener('sessionstart', () => {
            const session = sceneEl.renderer.xr.getSession();
            
            // 2. Try to place via tapping the AR screen (Extremely reliable WebXR standard)
            session.addEventListener('select', placeModel);

            session.requestReferenceSpace('viewer').then((space) => {
                this.viewerSpace = space;
                session.requestHitTestSource({ space: this.viewerSpace }).then((hitTestSource) => {
                    this.xrHitTestSource = hitTestSource;
                });
            });
            session.requestReferenceSpace('local-floor').then((space) => {
                this.refSpace = space;
            });
        });

        sceneEl.renderer.xr.addEventListener('sessionend', () => {
            this.xrHitTestSource = null;
            this.viewerSpace = null;
            this.refSpace = null;
            this.reticle.object3D.visible = false;
        });
    },
    tick: function () {
        const sceneEl = this.el.sceneEl;
        if (sceneEl.is('ar-mode') && this.viewerSpace && this.xrHitTestSource) {
            const frame = sceneEl.frame;
            const xrViewerPose = frame.getViewerPose(this.refSpace);
            
            if (xrViewerPose) {
                const hitTestResults = frame.getHitTestResults(this.xrHitTestSource);
                if (hitTestResults.length > 0) {
                    const pose = hitTestResults[0].getPose(this.refSpace);
                    this.reticle.setAttribute('position', pose.transform.position);
                    this.reticle.object3D.visible = true;
                } else {
                    this.reticle.object3D.visible = false;
                }
            }
        }
    }
});

// ==========================================
// 3. UI SELECTION LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
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

    let currentCategory = 'chair';
    let currentIndex = 0;
    let selectedModelPath = furnitureData['chair'][0];

    const categoryButtons = document.querySelectorAll('.category-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const modelPreviewText = document.getElementById('model-preview-text');
    
    const startArBtn = document.getElementById('start-ar-btn');
    const selectionUi = document.getElementById('selection-ui');
    const arUi = document.getElementById('ar-ui');
    const placedModel = document.getElementById('placed-model');
    const sceneEl = document.querySelector('a-scene');

    function updatePreview() {
        const modelsList = furnitureData[currentCategory];
        selectedModelPath = modelsList[currentIndex];
        const fileName = selectedModelPath.split('/').pop();
        modelPreviewText.textContent = fileName;
    }

    categoryButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = e.target.getAttribute('data-category');
            currentIndex = 0; 
            updatePreview();
        });
    });

    nextBtn.addEventListener('click', () => {
        const modelsList = furnitureData[currentCategory];
        currentIndex++;
        if (currentIndex >= modelsList.length) currentIndex = 0;
        updatePreview();
    });

    prevBtn.addEventListener('click', () => {
        const modelsList = furnitureData[currentCategory];
        currentIndex--;
        if (currentIndex < 0) currentIndex = modelsList.length - 1;
        updatePreview();
    });

    updatePreview();

    startArBtn.addEventListener('click', () => {
        placedModel.setAttribute('src', selectedModelPath);
        
        selectionUi.style.display = 'none';
        arUi.style.display = 'block';

        if (sceneEl.hasLoaded) {
            sceneEl.enterVR(true);
        } else {
            sceneEl.addEventListener('loaded', () => {
                sceneEl.enterVR(true);
            });
        }
    });
    
    sceneEl.addEventListener('exit-vr', () => {
        selectionUi.style.display = 'flex'; 
        arUi.style.display = 'none';
        
        // Hide model by resetting scale to 0 when leaving AR
        placedModel.setAttribute('scale', '0 0 0'); 
    });
});