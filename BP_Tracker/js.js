<script>
    // Elements
    const video = document.getElementById('video-feed');
    const preview = document.getElementById('preview-image');
    const btnCamera = document.getElementById('btn-camera');
    const btnUpload = document.getElementById('btn-upload');
    const fileInput = document.getElementById('file-input');
    const loading = document.getElementById('loading');
    const resultSection = document.getElementById('result-section');
    const cameraContainer = document.getElementById('camera-container');
    const cameraPlaceholder = document.getElementById('camera-placeholder');

    // Logic to handle Camera
    let stream = null;

    btnCamera.addEventListener('click', async () => {
        if (stream) {
            // If camera is already on, take picture
            takePicture();
        } else {
            // Open camera
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });
                video.srcObject = stream;
                video.classList.remove('hidden');
                cameraPlaceholder.classList.add('hidden');
                preview.classList.add('hidden');
                btnCamera.textContent = 'จับภาพ';
                btnCamera.classList.replace('bg-blue-600', 'bg-red-500');
            } catch (err) {
                alert('ไม่สามารถเปิดกล้องได้: ' + err.message);
            }
        }
    });

    function takePicture() {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);

        // Stop camera
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        video.classList.add('hidden');

        // Show preview
        const imageDataUrl = canvas.toDataURL('image/jpeg');
        preview.src = imageDataUrl;
        preview.classList.remove('hidden');

        // Reset button
        btnCamera.textContent = 'ถ่ายรูปใหม่';
        btnCamera.classList.replace('bg-red-500', 'bg-blue-600');

        // Process
        processImage(imageDataUrl);
    }

    // Logic for Upload
    btnUpload.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.classList.remove('hidden');
            cameraPlaceholder.classList.add('hidden');
            processImage(e.target.result);
        };
        reader.readAsDataURL(file);
    });

    function processImage(base64Data) {
        loading.classList.remove('hidden');
        resultSection.classList.add('hidden');

        // Clean base64 string
        const cleanBase64 = base64Data.split(',')[1];

        google.script.run
            .withSuccessHandler(onProcessSuccess)
            .withFailureHandler(onProcessFailure)
            .processImage(cleanBase64);
    }

    function onProcessSuccess(response) {
        loading.classList.add('hidden');
        if (response.success) {
            // Show data
            document.getElementById('input-sys').value = response.data.systolic;
            document.getElementById('input-dia').value = response.data.diastolic;
            document.getElementById('input-pul').value = response.data.pulse;

            // Show advice (mock logic for now on client side usually done on server or calculated here)
            updateAdvice();

            resultSection.classList.remove('hidden');
            resultSection.classList.remove('opacity-0');
        } else {
            alert('เกิดข้อผิดพลาดในการประมวลผล');
        }
    }

    function onProcessFailure(err) {
        loading.classList.add('hidden');
        alert('Error: ' + err.message);
    }

    function updateAdvice() {
        // Simple client side advice update
        const sys = parseInt(document.getElementById('input-sys').value);
        const dia = parseInt(document.getElementById('input-dia').value);
        const adviceBox = document.getElementById('advice-box');

        let msg = "";
        if (sys > 140 || dia > 90) {
            msg = "ความดันโลหิตสูง! ควรลดอาหารเค็ม ออกกำลังกายเบาๆ และพักผ่อนให้เพียงพอ หากสูงต่อเนื่องควรรีบพบแพทย์";
            adviceBox.className = "bg-red-50 border-l-4 border-red-500 p-3 text-sm text-red-800 mb-4";
        } else if (sys < 90 || dia < 60) {
            msg = "ความดันโลหิตต่ำ! ควรดื่มน้ำให้มากขึ้น ลุกนั่งช้าๆ เพื่อป้องกันหน้ามืด";
            adviceBox.className = "bg-yellow-50 border-l-4 border-yellow-400 p-3 text-sm text-yellow-800 mb-4";
        } else {
            msg = "ความดันโลหิตปกติ รักษาสุขภาพต่อไปนะครับ";
            adviceBox.className = "bg-green-50 border-l-4 border-green-500 p-3 text-sm text-green-800 mb-4";
        }
        adviceBox.textContent = msg;
    }

    // Save button logic
    document.getElementById('btn-save').addEventListener('click', () => {
        loading.classList.remove('hidden');
        const data = {
            systolic: document.getElementById('input-sys').value,
            diastolic: document.getElementById('input-dia').value,
            pulse: document.getElementById('input-pul').value,
        };

        google.script.run
            .withSuccessHandler(() => {
                loading.classList.add('hidden');
                alert('บันทึกข้อมูลเรียบร้อย!');
                // Reset UI?
            })
            .withFailureHandler(onProcessFailure)
            .logBPData(data);
    });
</script>