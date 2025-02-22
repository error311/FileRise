document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file');
    const uploadBtn = document.getElementById('uploadBtn');
    const uploadForm = document.getElementById('uploadFileForm');
    const statusMessage = document.getElementById('statusMessage');
    const progressBar = document.getElementById('progressBar');
    const progressRow = document.getElementById('progressRow');
    const fileName = document.getElementById('fileName');

    function convertToBytes(size) {
        const units = { 'G': 1024 * 1024 * 1024, 'M': 1024 * 1024, 'K': 1024 };
        const unit = size.slice(-1).toUpperCase();
        const number = parseFloat(size.slice(0, -1));
        return units[unit] ? number * units[unit] : number;
    }

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            uploadBtn.disabled = false;
            fileName.textContent = fileInput.files[0].name;
        } else {
            uploadBtn.disabled = true;
            fileName.textContent = '';
        }
    });

    uploadBtn.addEventListener('click', () => {
        const file = fileInput.files[0];
        if (!file) {
            alert('No file selected.');
            return;
        }

        fetch('get_upload_size.php')
            .then(response => response.text())
            .then(currentSize => {
                const totalUploadLimit = convertToBytes('20G'); // Replace '20G' with your dynamic limit
                const newSize = parseInt(currentSize) + file.size;

                if (newSize > totalUploadLimit) {
                    alert('Upload denied. Total upload limit exceeded.');
                } else {
                    uploadFile();
                }
            })
            .catch(error => {
                console.error('Error fetching current upload size:', error);
                alert('Error fetching current upload size.');
            });
    });

    function uploadFile() {
        const formData = new FormData(uploadForm);
        progressRow.style.display = 'block';
        statusMessage.textContent = '';

        $.ajax({
            url: 'upload.php',
            type: 'POST',
            data: formData,
            contentType: false,
            processData: false,
            xhr: function() {
                const xhr = new window.XMLHttpRequest();
                xhr.upload.addEventListener('progress', function(evt) {
                    if (evt.lengthComputable) {
                        const percentComplete = (evt.loaded / evt.total) * 100;
                        progressBar.style.width = percentComplete + '%';
                    }
                }, false);
                return xhr;
            },
            success: function(response) {
                progressBar.style.width = '0%';
                progressRow.style.display = 'none';
                statusMessage.textContent = response;
                uploadBtn.disabled = true;
            }
        })
    }
})
