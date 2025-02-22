document.addEventListener("DOMContentLoaded", function () {
    const fileInput = document.getElementById("file");
    const uploadBtn = document.getElementById("uploadBtn");
    const uploadForm = document.getElementById("uploadFileForm");

    if (!fileInput || !uploadBtn || !uploadForm) {
        console.error("Upload elements not found.");
        return;
    }

    // Create a div for displaying selected file names
    let fileListDisplay = document.getElementById("selectedFiles");
    if (!fileListDisplay) {
        fileListDisplay = document.createElement("div");
        fileListDisplay.id = "selectedFiles";
        fileListDisplay.style.marginTop = "10px"; // Space below file input
        fileListDisplay.style.padding = "10px";
        fileListDisplay.style.border = "1px solid #ddd";
        fileListDisplay.style.borderRadius = "5px";
        fileListDisplay.style.background = "#f8f9fa"; // Light gray background
        fileListDisplay.style.display = "none"; // Hide initially

        // Ensure the upload button exists before inserting
        if (uploadBtn.parentNode) {
            uploadBtn.parentNode.insertBefore(fileListDisplay, uploadBtn); // Place above upload button
        } else {
            console.error("Upload button parent node not found.");
        }
    }

    // Display selected file names and move the upload button down
    fileInput.addEventListener("change", function () {
        uploadBtn.disabled = fileInput.files.length === 0;
        fileListDisplay.innerHTML = ""; // Clear previous list

        if (fileInput.files.length > 0) {
            fileListDisplay.style.display = "block"; // Show file list
            const list = document.createElement("ul");
            list.style.padding = "0";
            list.style.margin = "0";
            list.style.listStyle = "none"; // Remove bullet points
            list.style.maxHeight = "150px"; // Prevent list from getting too tall
            list.style.overflowY = "auto"; // Scroll if too many files

            for (let i = 0; i < fileInput.files.length; i++) {
                const listItem = document.createElement("li");
                listItem.textContent = fileInput.files[i].name;
                listItem.style.borderBottom = "1px solid #ddd";
                listItem.style.padding = "5px 10px";
                list.appendChild(listItem);
            }
            fileListDisplay.appendChild(list);
        } else {
            fileListDisplay.style.display = "none"; // Hide if no files selected
        }

        // Move upload button down when files are selected
        uploadBtn.style.marginTop = "10px";
    });

    // Handle multiple file uploads
    uploadForm.addEventListener("submit", function (event) {
        event.preventDefault();
        
        if (fileInput.files.length === 0) {
            alert("Please select at least one file.");
            return;
        }

        const formData = new FormData();
        for (let i = 0; i < fileInput.files.length; i++) {
            formData.append("file[]", fileInput.files[i]);
        }

        uploadBtn.disabled = true; // Disable button while uploading

        fetch("upload.php", {
            method: "POST",
            body: formData
        })
        .then(response => response.json())
        .then(result => {
            console.log("Upload result:", result);

            if (Array.isArray(result)) {
                alert(result.map(r => r.success || r.error).join("\n"));
            } else {
                alert(result.success || result.error || "Upload completed.");
            }

            loadFileList(); // Refresh file list after upload
            fileListDisplay.innerHTML = ""; // Clear displayed file list
            fileListDisplay.style.display = "none"; // Hide after upload
            fileInput.value = ""; // Reset file input
            uploadBtn.disabled = false; // Re-enable button after upload
        })
        .catch(error => {
            console.error("Upload error:", error);
            uploadBtn.disabled = false;
        });
    });
});
