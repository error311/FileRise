let fileData = []; // Store file data globally
let sortOrder = { column: "uploaded", ascending: false }; // Default sorting by uploaded date (newest first)

// Load and display the file list
window.loadFileList = function () {
    fetch("checkAuth.php")
        .then(response => response.json())
        .then(authData => {
            if (!authData.authenticated) {
                console.warn("User not authenticated, hiding file list.");
                document.getElementById("fileListContainer").style.display = "none";
                return;
            }
            document.getElementById("fileListContainer").style.display = "block";
            fetch("getFileList.php")
                .then(response => response.json())
                .then(data => {
                    if (data.error) {
                        document.getElementById("fileList").innerHTML = `<p style="color:red;">Error: ${data.error}</p>`;
                        return;
                    }
                    if (!Array.isArray(data.files)) {
                        console.error("Unexpected response format:", data);
                        return;
                    }
                    fileData = data.files; // Store file data globally
                    sortFiles("uploaded", false); // Sort by upload date (newest first) on load
                })
                .catch(error => console.error("Error fetching file list:", error));
        })
        .catch(error => console.error("Error checking authentication:", error));
};

// Sort files when clicking headers
function sortFiles(column, forceAscending = null) {
    if (sortOrder.column === column) {
        sortOrder.ascending = forceAscending !== null ? forceAscending : !sortOrder.ascending; // Toggle order
    } else {
        sortOrder.column = column;
        sortOrder.ascending = forceAscending !== null ? forceAscending : true; // Default to ascending when switching column
    }
    fileData.sort((a, b) => {
        let valA = a[column] || "";
        let valB = b[column] || "";
        if (typeof valA === "string") valA = valA.toLowerCase();
        if (typeof valB === "string") valB = valB.toLowerCase();
        if (valA < valB) return sortOrder.ascending ? -1 : 1;
        if (valA > valB) return sortOrder.ascending ? 1 : -1;
        return 0;
    });
    renderFileTable(); // Re-render table after sorting
}

// Function to render file table
function renderFileTable() {
    const fileListContainer = document.getElementById("fileList");
    let tableHTML = `<table class="table">
        <thead>
            <tr>
                <th><input type="checkbox" id="selectAll" onclick="toggleAllCheckboxes(this)"></th>
                <th onclick="sortFiles('name')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>File Name</span> <span>${sortOrder.column === "name" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th onclick="sortFiles('modified')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>Date Modified</span> <span>${sortOrder.column === "modified" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th onclick="sortFiles('uploaded')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>Upload Date</span> <span>${sortOrder.column === "uploaded" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th onclick="sortFiles('sizeBytes')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>File Size</span> <span>${sortOrder.column === "sizeBytes" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th onclick="sortFiles('uploader')" style="cursor:pointer; text-decoration: underline; white-space: nowrap;">
                    <span>Uploader</span> <span>${sortOrder.column === "uploader" ? (sortOrder.ascending ? "▲" : "▼") : ""}</span>
                </th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>`;
    
    fileData.forEach(file => {
        const isEditable = file.name.endsWith(".txt") || file.name.endsWith(".json") ||
                           file.name.endsWith(".ini") || file.name.endsWith(".css") || 
                           file.name.endsWith(".js") || file.name.endsWith(".csv") || 
                           file.name.endsWith(".md") || file.name.endsWith(".xml") || 
                           file.name.endsWith(".html") || file.name.endsWith(".py") ||
                           file.name.endsWith(".log") || file.name.endsWith(".conf") || 
                           file.name.endsWith(".config") || file.name.endsWith(".bat") || 
                           file.name.endsWith(".rtf") || file.name.endsWith(".doc") || 
                           file.name.endsWith(".docx");
        tableHTML += `<tr>
            <td><input type="checkbox" class="file-checkbox" value="${file.name}" onclick="toggleDeleteButton()"></td>
            <td>${file.name}</td>
            <td style="white-space: nowrap;">${file.modified}</td>
            <td style="white-space: nowrap;">${file.uploaded}</td>
            <td style="white-space: nowrap;">${file.size}</td>
            <td style="white-space: nowrap;">${file.uploader || "Unknown"}</td>
            <td>
                <div style="display: inline-flex; align-items: center; gap: 5px; flex-wrap: nowrap;">
                    <a href="uploads/${file.name}" download>Download</a>
                    ${isEditable ? `<button onclick="editFile('${file.name}')">Edit</button>` : ""}
                </div>
            </td>
        </tr>`;
    });
    
    tableHTML += `</tbody></table>`;
    fileListContainer.innerHTML = tableHTML;
    
    // Always display the batch delete button if there are files; disable it if no file is selected.
    const deleteBtn = document.getElementById("deleteSelectedBtn");
    if (fileData.length > 0) {
        deleteBtn.style.display = "block";
        // Check if any checkboxes are selected to enable the button; if none, disable it.
        const selectedFiles = document.querySelectorAll(".file-checkbox:checked");
        deleteBtn.disabled = selectedFiles.length === 0;
    } else {
        deleteBtn.style.display = "none";
    }
}

// Function to toggle delete button enabled state
function toggleDeleteButton() {
    const selectedFiles = document.querySelectorAll(".file-checkbox:checked");
    const deleteBtn = document.getElementById("deleteSelectedBtn");
    deleteBtn.disabled = selectedFiles.length === 0;
}

// Select/Deselect All Checkboxes
window.toggleAllCheckboxes = function (source) {
    const checkboxes = document.querySelectorAll(".file-checkbox");
    checkboxes.forEach(checkbox => checkbox.checked = source.checked);
    toggleDeleteButton();
};

// Batch delete function
window.deleteSelectedFiles = function () {
    const selectedFiles = Array.from(document.querySelectorAll(".file-checkbox:checked"))
        .map(checkbox => checkbox.value);
    if (selectedFiles.length === 0) {
        alert("No files selected for deletion.");
        return;
    }
    if (!confirm(`Are you sure you want to delete the selected files?`)) {
        return;
    }
    fetch("deleteFiles.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: selectedFiles })
    })
    .then(response => response.json())
    .then(result => {
        alert(result.success || result.error);
        loadFileList();
    })
    .catch(error => console.error("Error deleting files:", error));
};

// Attach event listener to batch delete button
document.addEventListener("DOMContentLoaded", function () {
    const deleteBtn = document.getElementById("deleteSelectedBtn");
    if (deleteBtn) {
        deleteBtn.addEventListener("click", deleteSelectedFiles);
    }
});

window.editFile = function(fileName) {
    console.log("Edit button clicked for:", fileName);
    let existingEditor = document.getElementById("editorContainer");
    if (existingEditor) {
        existingEditor.remove();
    }
    fetch(`uploads/${fileName}?t=${new Date().getTime()}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.text();
        })
        .then(content => {
            const editorContainer = document.createElement("div");
            editorContainer.id = "editorContainer";
            editorContainer.style.position = "fixed";
            editorContainer.style.top = "50%";
            editorContainer.style.left = "50%";
            editorContainer.style.transform = "translate(-50%, -50%)";
            editorContainer.style.background = "white";
            editorContainer.style.padding = "15px";
            editorContainer.style.border = "1px solid black";
            editorContainer.style.boxShadow = "0px 4px 6px rgba(0,0,0,0.1)";
            editorContainer.style.zIndex = "1000";
            editorContainer.style.width = "80vw";
            editorContainer.style.maxWidth = "90vw";
            editorContainer.style.minWidth = "400px";
            editorContainer.style.height = "400px";
            editorContainer.style.maxHeight = "80vh";
            editorContainer.style.overflow = "auto";
            editorContainer.style.resize = "both";
            editorContainer.innerHTML = `
                <h3>Editing: ${fileName}</h3>
                <textarea id="fileEditor" style="width: 100%; height: 80%; resize: none;">${content}</textarea>
                <br>
                <button onclick="saveFile('${fileName}')">Save</button>
                <button onclick="document.getElementById('editorContainer').remove()">Close</button>
            `;
            document.body.appendChild(editorContainer);
        })
        .catch(error => console.error("Error loading file:", error));
};

window.saveFile = function(fileName) {
    const editor = document.getElementById("fileEditor");
    if (!editor) {
        console.error("Editor not found!");
        return;
    }
    const fileData = {
        fileName: fileName,
        content: editor.value
    };
    fetch("saveFile.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fileData)
    })
    .then(response => response.json())
    .then(result => {
        alert(result.success || result.error);
        document.getElementById("editorContainer")?.remove();
        loadFileList();
    })
    .catch(error => console.error("Error saving file:", error));
};
