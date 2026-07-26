// renderer/js/app.js

document.addEventListener('DOMContentLoaded', function() {
    const greetingElement = document.getElementById('greeting');
    if (greetingElement) {
        greetingElement.textContent = 'Hallo und willkommen!';
    }
});
