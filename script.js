// Store all job applications in memory
let jobs = [];

// Grab elements from the page
const form = document.getElementById("job-form");
const jobList = document.getElementById("application-list");

// Listen for form submit
form.addEventListener("submit", function (event) {
    event.preventDefault();

    // Step 1: Get values from form
    const company = document.getElementById("company").value;
    const position = document.getElementById("position").value;
    const status = document.getElementById("status").value;
    const date = document.getElementById("date").value;

    // Step 2: Create job object
    const job = {
        company: company,
        position: position,
        status: status,
        date: date
    };

    // Step 3: Add to array
    jobs.push(job);

    // Step 4: Render everything
    renderJobs();

    // Step 5: Reset form
    form.reset();
});


// Function that displays jobs on the page
function renderJobs() {
    // Clear current list
    jobList.innerHTML = "";

    // Loop through all jobs
    jobs.forEach(function (job) {

        // Create a new div for each job
        const jobCard = document.createElement("div");
        jobCard.classList.add("job-card");

        // Fill it with content
        jobCard.innerHTML = `
            <h3>${job.company}</h3>
            <p><strong>Position:</strong> ${job.position}</p>
            <p><strong>Status:</strong> ${job.status}</p>
            <p><strong>Date:</strong> ${job.date}</p>
        `;

        // Add it to the page
        jobList.appendChild(jobCard);
    });
}
