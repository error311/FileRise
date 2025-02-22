document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("fileListContainer").style.display = "none"; // Hide file list on load
    document.getElementById("uploadForm").style.display = "none"; // Hide upload form on load

    checkAuthentication();

    document.getElementById("authForm").addEventListener("submit", function (event) {
        event.preventDefault();
        
        const formData = {
            username: document.getElementById("loginUsername").value.trim(),
            password: document.getElementById("loginPassword").value.trim()
        };

        console.log("Sending login data:", formData);

        fetch("auth.php", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
        })
        .then(response => response.json())
        .then(data => {
            console.log("Login response:", data);
            if (data.success) {
                console.log("Login successful.");
                document.getElementById("loginForm").style.display = "none";
                document.getElementById("uploadForm").style.display = "block";
                document.getElementById("fileListContainer").style.display = "block";
                checkAuthentication(); // Recheck authentication to show the file list
            } else {
                alert("Login failed: " + (data.error || "Unknown error"));
            }
        })
        .catch(error => console.error("Error logging in:", error));
    });
});

function checkAuthentication() {
    fetch("checkAuth.php")
        .then(response => response.json())
        .then(data => {
            console.log("Authentication check:", data);
            if (data.authenticated) {
                console.log("User authenticated, showing file list.");
                document.getElementById("loginForm").style.display = "none";
                document.getElementById("uploadForm").style.display = "block";
                document.getElementById("fileListContainer").style.display = "block";
                loadFileList();
            } else {
                // Only log a warning if the file list is supposed to be shown (i.e. after a login)
                if (document.getElementById("uploadForm").style.display === "block") {
                    console.warn("User not authenticated.");
                }
                document.getElementById("loginForm").style.display = "block";
                document.getElementById("uploadForm").style.display = "none";
                document.getElementById("fileListContainer").style.display = "none";
            }
        })
        .catch(error => console.error("Error checking authentication:", error));
}

