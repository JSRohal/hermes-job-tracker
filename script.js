// Grab the form from the HTML
const form = document.getElementById("job-form");

// Listen for when the form is submitted
form.addEventListener("submit", function (event) {
    // Prevent page from refreshing
    event.preventDefault();

    // Get values from inputs
    const company = document.getElementById("company").value;
    const position = document.getElementById("position").value;
    const status = document.getElementById("status").value;
    const date = document.getElementById("date").value;

    // Create a job object
    const jobApplication = {
        company: company,
        position: position,
        status: status,
        date: date
    };

    // For now: just print it to the console
    console.log("New Job Application:", jobApplication);

    // Reset form after submit
    form.reset();
});
