// folderManager.js
import {
    loadFileList 
  } from './fileManager.js';
  
  
  export function renameFolder() {
      const folderSelect = document.getElementById("folderSelect");
      const selectedFolder = folderSelect.value;
      const newFolderName = prompt("Enter the new folder name:", selectedFolder);
      if (newFolderName && newFolderName !== selectedFolder) {
        fetch("renameFolder.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldName: selectedFolder, newName: newFolderName })
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert("Folder renamed successfully!");
              loadFolderList("root");
            } else {
              alert("Error: " + (data.error || "Could not rename folder"));
            }
          })
          .catch(error => console.error("Error renaming folder:", error));
      }
    }
    
    export function deleteFolder() {
      const folderSelect = document.getElementById("folderSelect");
      const selectedFolder = folderSelect.value;
      if (!selectedFolder || selectedFolder === "root") {
        alert("Please select a valid folder to delete.");
        return;
      }
      
      // Only prompt once.
      if (!confirm("Are you sure you want to delete folder " + selectedFolder + "?")) {
        return;
      }
      
      // Proceed with deletion.
      fetch("deleteFolder.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: selectedFolder })
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert("Folder deleted successfully!");
            // Refresh both folder dropdowns.
            loadFolderList("root");
            loadCopyMoveFolderList();
          } else {
            alert("Error: " + (data.error || "Could not delete folder"));
          }
        })
        .catch(error => console.error("Error deleting folder:", error));
    }
    
    
  // Updates the copy/move folder dropdown.
  export async function loadCopyMoveFolderList() {
    try {
      const response = await fetch('getFolderList.php');
      const folders = await response.json();
      const folderSelect = document.getElementById('copyMoveFolderSelect');
      folderSelect.innerHTML = ''; // Clear existing options
  
      // Always add a "Root" option as the default.
      const rootOption = document.createElement('option');
      rootOption.value = 'root';
      rootOption.textContent = '(Root)';
      folderSelect.appendChild(rootOption);
  
      if (Array.isArray(folders) && folders.length > 0) {
        folders.forEach(folder => {
          const option = document.createElement('option');
          option.value = folder;
          option.textContent = folder;
          folderSelect.appendChild(option);
        });
      }
    } catch (error) {
      console.error('Error loading folder list:', error);
    }
  }
  
    
    // Optional helper to load folder lists (alias for loadCopyMoveFolderList).
  
    export function loadFolderList(selectedFolder) {
      const folderSelect = document.getElementById("folderSelect");
      folderSelect.innerHTML = "";
      const rootOption = document.createElement("option");
      rootOption.value = "root";
      rootOption.textContent = "(Root)";
      folderSelect.appendChild(rootOption);
      
      fetch("getFolderList.php")
        .then(response => response.json())
        .then(folders => {
          folders.forEach(function (folder) {
            let option = document.createElement("option");
            option.value = folder;
            option.textContent = folder;
            folderSelect.appendChild(option);
          });
          
          // Set the selected folder if provided, else default to "root"
          if (selectedFolder && [...folderSelect.options].some(opt => opt.value === selectedFolder)) {
            folderSelect.value = selectedFolder;
          } else {
            folderSelect.value = "root";
          }
          
          // Update global currentFolder and title, then load the file list
          window.currentFolder = folderSelect.value;
          document.getElementById("fileListTitle").textContent =
            window.currentFolder === "root" ? "Files in (Root)" : "Files in (" + window.currentFolder + ")";
          loadFileList(window.currentFolder);
        })
        .catch(error => console.error("Error loading folder list:", error));
    }
    
    // Event listener for folder dropdown changes
    document.getElementById("folderSelect").addEventListener("change", function () {
      window.currentFolder = this.value;
      document.getElementById("fileListTitle").textContent =
        window.currentFolder === "root" ? "Files in (Root)" : "Files in (" + window.currentFolder + ")";
      loadFileList(window.currentFolder);
    });
    
    // Event listener for creating a folder
    document.getElementById("createFolderBtn").addEventListener("click", function () {
      let folderName = prompt("Enter folder name:");
      if (folderName) {
        fetch("createFolder.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: folderName })
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert("Folder created successfully!");
              loadFolderList(folderName);
              loadCopyMoveFolderList();
            } else {
              alert("Error: " + (data.error || "Could not create folder"));
            }
          })
          .catch(error => console.error("Error creating folder:", error));
      }
    });
    
    // Event listener for renaming a folder
    document.getElementById("renameFolderBtn").addEventListener("click", function () {
      const folderSelect = document.getElementById("folderSelect");
      const selectedFolder = folderSelect.value;
      if (!selectedFolder || selectedFolder === "root") {
        alert("Please select a valid folder to rename.");
        return;
      }
      let newFolderName = prompt("Enter new folder name for '" + selectedFolder + "':", selectedFolder);
      if (newFolderName && newFolderName !== selectedFolder) {
        fetch("renameFolder.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldFolder: selectedFolder, newFolder: newFolderName })
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert("Folder renamed successfully!");
              loadCopyMoveFolderList()
              loadFolderList(newFolderName);
            } else {
              alert("Error: " + (data.error || "Could not rename folder"));
            }
          })
          .catch(error => console.error("Error renaming folder:", error));
      }
    });
    
    // Event listener for deleting a folder
    document.getElementById("deleteFolderBtn").addEventListener("click", function () {
      const folderSelect = document.getElementById("folderSelect");
      const selectedFolder = folderSelect.value;
      if (!selectedFolder || selectedFolder === "root") {
        alert("Please select a valid folder to delete.");
        return;
      }
      if (confirm("Are you sure you want to delete folder " + selectedFolder + "?")) {
        fetch("deleteFolder.php", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: selectedFolder })
        })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert("Folder deleted successfully!");
              loadFolderList("root");
            } else {
              alert("Error: " + (data.error || "Could not delete folder"));
            }
          })
          .catch(error => console.error("Error deleting folder:", error));
      }
    });
    
    