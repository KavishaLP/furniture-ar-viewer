// ==========================================
// 1. TOUCH GESTURES (ROTATE & SCALE)
// ==========================================
AFRAME.registerComponent('gesture-handler', {
    schema: {
        minScale: { default: 0.2 },
        maxScale: { default: 3.0 },
        rotationSensitivity: { default: 0.05 } // Adjust for faster/slower rotation
    },
    init: function () {
        this.touchState = { 
            isDown: false, 
            initialDistance: 0, 
            initialScale: 0.6, 
            lastX: 0 
        };
        
        // Listen to touches on the canvas
        const canvas = this.el.sceneEl.canvas;
        
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                // One finger: setup rotation
                this.touchState.isDown = true;
                this.touchState.lastX = e.touches[0].clientX;
            } else if (e.touches.length === 2) {
                // Two fingers: setup scale
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
                // One finger: rotate model around Y axis
                const deltaX = e.touches[0].clientX - this.touchState.lastX;
                this.el.object3D.rotation.y += deltaX * this.data.rotationSensitivity;
                this.touchState.lastX = e.touches[0].clientX;
            } else if (e.touches.length === 2) {
                // Two fingers: scale model
                const currentDistance = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const scaleFactor = currentDistance / this.touchState.initialDistance;
                let newScale = this.touchState.initialScale * scaleFactor;
                
                // Clamp scale to min/max bounds
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
// 2. UI LOGIC (CAROUSEL & MODEL SWAPPING)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Updated Database mapping to your new folder structure
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

    const modelEntity = document.getElementById('furniture-model');
    const categoryButtons = document.querySelectorAll('.category-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');

    // Helper function to update the model source
    function updateModel() {
        const modelsList = furnitureData[currentCategory];
        const newModelPath = modelsList[currentIndex];
        modelEntity.setAttribute('src', newModelPath);
    }

    // Category Selector Buttons
    categoryButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            // Update active styling
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            // Switch category and reset index to 0
            currentCategory = e.target.getAttribute('data-category');
            currentIndex = 0; 
            
            updateModel();
        });
    });

    // Next Button (>)
    nextBtn.addEventListener('click', () => {
        const modelsList = furnitureData[currentCategory];
        currentIndex++;
        
        // Loop back to the first model if we exceed the array length
        if (currentIndex >= modelsList.length) {
            currentIndex = 0;
        }
        updateModel();
    });

    // Previous Button (<)
    prevBtn.addEventListener('click', () => {
        const modelsList = furnitureData[currentCategory];
        currentIndex--;
        
        // Loop to the last model if we drop below 0
        if (currentIndex < 0) {
            currentIndex = modelsList.length - 1;
        }
        updateModel();
    });
});