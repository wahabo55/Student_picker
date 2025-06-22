class StudentPicker {
    constructor() {
        this.students = [];
        this.isSpinning = false;
        this.wheelCanvas = null;
        this.wheelCtx = null;
        this.currentRotation = 0;
        this.spinDuration = 0;
        this.spinStartTime = 0;
        this.sessionId = null;
        this.isConnected = false;
        
        this.initializeApp();
        this.setupEventListeners();
        this.loadSession();
    }

    initializeApp() {
        const urlParams = new URLSearchParams(window.location.search);
        const view = urlParams.get('view');
        const sessionId = urlParams.get('session');
        
        if (sessionId) {
            document.getElementById('studentSessionId').value = sessionId;
        }
        
        if (view === 'student') {
            this.showStudentView();
        } else {
            this.showPresenterView();
        }
    }

    setupEventListeners() {
        // Navigation
        document.getElementById('presenterBtn').addEventListener('click', () => this.showPresenterView());
        document.getElementById('studentBtn').addEventListener('click', () => this.showStudentView());
        
        // Session management
        document.getElementById('generateSessionBtn').addEventListener('click', () => this.generateNewSession());
        document.getElementById('connectSessionBtn').addEventListener('click', () => this.connectToSession());
        
        // Presenter controls
        document.getElementById('startPickBtn').addEventListener('click', () => this.startRandomPick());
        document.getElementById('clearStudentsBtn').addEventListener('click', () => this.clearAllStudents());
        document.getElementById('showStudentsBtn').addEventListener('click', () => this.toggleStudentsList());
        document.getElementById('stopWheelBtn').addEventListener('click', () => this.stopWheel());
        document.getElementById('newPickBtn').addEventListener('click', () => this.resetForNewPick());
          // Student registration
        document.getElementById('registrationForm').addEventListener('submit', (e) => this.registerStudent(e));
    }// Session Management using Firebase Realtime Database
    loadSession() {
        const savedSession = localStorage.getItem('pickerSessionId');
        if (savedSession) {
            document.getElementById('sessionId').value = savedSession;
            this.connectToSession();
        }
    }

    generateNewSession() {
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        document.getElementById('sessionId').value = sessionId;
        this.connectToSession();
    }

    async connectToSession() {
        const sessionIdInput = document.getElementById('sessionId').value.trim();
        if (!sessionIdInput) {
            alert('Please enter a session ID');
            return;
        }

        this.sessionId = sessionIdInput;
        localStorage.setItem('pickerSessionId', this.sessionId);
        
        try {
            await this.initializeFirebase();
            this.isConnected = true;
            this.updateSessionStatus('Connected to session: ' + this.sessionId, true);
            this.generateQRCode();
            this.setupRealtimeListener();
        } catch (error) {
            console.error('Failed to connect to session:', error);
            this.updateSessionStatus('Failed to connect', false);
            this.isConnected = false;
        }
    }

    // Initialize Firebase connection
    async initializeFirebase() {
        if (!window.firebaseDB) {
            throw new Error('Firebase not initialized');
        }
        
        this.sessionRef = window.firebaseRef(window.firebaseDB, `sessions/${this.sessionId}/students`);
        
        // Initialize session data if it doesn't exist
        try {
            const snapshot = await window.firebaseGet(this.sessionRef);
            if (!snapshot.exists()) {
                await window.firebaseSet(this.sessionRef, {});
            }
        } catch (error) {
            console.error('Error initializing session:', error);
        }
    }

    // Setup real-time listener for student changes
    setupRealtimeListener() {
        if (!this.sessionRef) return;
        
        window.firebaseOnValue(this.sessionRef, (snapshot) => {
            const data = snapshot.val();
            this.students = data ? Object.values(data) : [];
            this.updateStudentCount();
            this.displayStudentsList();
        });
    }

    updateSessionStatus(message, connected) {
        const statusElement = document.getElementById('sessionStatus');
        statusElement.textContent = message;
        statusElement.className = connected ? 'session-status connected' : 'session-status disconnected';
    }

    // Firebase database operations
    async saveStudentToFirebase(student) {
        if (!this.sessionRef) return false;
        
        try {
            const studentRef = window.firebaseRef(window.firebaseDB, `sessions/${this.sessionId}/students/${student.id}`);
            await window.firebaseSet(studentRef, student);
            return true;
        } catch (error) {
            console.error('Failed to save student to Firebase:', error);
            return false;
        }
    }

    async removeStudentFromFirebase(studentId) {
        if (!this.sessionRef) return false;
        
        try {
            const studentRef = window.firebaseRef(window.firebaseDB, `sessions/${this.sessionId}/students/${studentId}`);
            await window.firebaseRemove(studentRef);
            return true;
        } catch (error) {
            console.error('Failed to remove student from Firebase:', error);
            return false;
        }
    }

    async clearAllStudentsFromFirebase() {
        if (!this.sessionRef) return false;
        
        try {
            await window.firebaseSet(this.sessionRef, {});
            return true;
        } catch (error) {
            console.error('Failed to clear students from Firebase:', error);
            return false;
        }
    }    async registerStudent(event) {
        event.preventDefault();
        
        const sessionIdInput = document.getElementById('studentSessionId');
        const nameInput = document.getElementById('studentName');
        const sessionId = sessionIdInput.value.trim();
        const name = nameInput.value.trim();
        const successDiv = document.getElementById('registrationSuccess');
        const errorDiv = document.getElementById('registrationError');
        
        // Hide previous messages
        successDiv.classList.add('hidden');
        errorDiv.classList.add('hidden');
        
        if (!sessionId) {
            errorDiv.querySelector('p').textContent = '❌ Please enter the session ID from your presenter.';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        if (!name || name.length < 2) {
            errorDiv.querySelector('p').textContent = '❌ Please enter a valid name (at least 2 characters).';
            errorDiv.classList.remove('hidden');
            return;
        }
        
        try {
            // Connect to Firebase for this session
            const sessionRef = window.firebaseRef(window.firebaseDB, `sessions/${sessionId}/students`);
            
            // Check existing students
            const snapshot = await window.firebaseGet(sessionRef);
            const existingStudents = snapshot.val() || {};
            
            // Check if name already exists (case insensitive)
            const existingStudent = Object.values(existingStudents).find(student => 
                student.name.toLowerCase() === name.toLowerCase()
            );
            
            if (existingStudent) {
                errorDiv.querySelector('p').textContent = '❌ This name is already registered.';
                errorDiv.classList.remove('hidden');
                return;
            }
            
            // Add student
            const student = {
                id: Date.now(),
                name: name,
                registeredAt: new Date().toISOString()
            };
            
            // Save to Firebase
            const studentRef = window.firebaseRef(window.firebaseDB, `sessions/${sessionId}/students/${student.id}`);
            await window.firebaseSet(studentRef, student);
            
            successDiv.classList.remove('hidden');
            nameInput.value = '';
            sessionIdInput.value = '';
            
            // Auto-hide success message after 3 seconds
            setTimeout(() => {
                successDiv.classList.add('hidden');
            }, 3000);
            
        } catch (error) {
            console.error('Registration failed:', error);
            errorDiv.querySelector('p').textContent = '❌ Registration failed. Please check the session ID and try again.';
            errorDiv.classList.remove('hidden');
        }
    }

    updateStudentCount() {
        document.getElementById('studentCount').textContent = this.students.length;
    }

    toggleStudentsList() {
        const listDiv = document.getElementById('studentsList');
        
        if (listDiv.classList.contains('hidden')) {
            this.displayStudentsList();
            listDiv.classList.remove('hidden');
            document.getElementById('showStudentsBtn').textContent = '🙈 Hide Students';
        } else {
            listDiv.classList.add('hidden');
            document.getElementById('showStudentsBtn').textContent = '👀 Show Students';
        }
    }

    displayStudentsList() {
        const container = document.getElementById('studentsContainer');
        container.innerHTML = '';
        
        if (this.students.length === 0) {
            container.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1 / -1;">No students registered yet.</p>';
            return;
        }
        
        this.students.forEach(student => {
            const studentDiv = document.createElement('div');
            studentDiv.className = 'student-item';
            studentDiv.innerHTML = `
                <span class="name">${this.escapeHtml(student.name)}</span>
                <button class="remove-btn" onclick="picker.removeStudent(${student.id})" title="Remove student">×</button>
            `;
            container.appendChild(studentDiv);
        });
    }    async removeStudent(studentId) {
        await this.removeStudentFromFirebase(studentId);
        // The real-time listener will update the UI automatically
    }

    async clearAllStudents() {
        if (this.students.length === 0) {
            alert('No students to clear.');
            return;
        }
        
        if (confirm(`Are you sure you want to remove all ${this.students.length} students?`)) {
            await this.clearAllStudentsFromFirebase();
            
            // Hide students list if visible
            document.getElementById('studentsList').classList.add('hidden');
            document.getElementById('showStudentsBtn').textContent = '👀 Show Students';
        }
    }

    // Navigation Methods
    showPresenterView() {
        document.getElementById('presenterView').classList.add('active');
        document.getElementById('studentView').classList.remove('active');
        document.getElementById('presenterBtn').classList.add('active');
        document.getElementById('studentBtn').classList.remove('active');
        
        const url = new URL(window.location);
        url.searchParams.delete('view');
        window.history.replaceState({}, '', url);
    }

    showStudentView() {
        document.getElementById('presenterView').classList.remove('active');
        document.getElementById('studentView').classList.add('active');
        document.getElementById('presenterBtn').classList.remove('active');
        document.getElementById('studentBtn').classList.add('active');
        
        const url = new URL(window.location);
        url.searchParams.set('view', 'student');
        window.history.replaceState({}, '', url);
    }

    // QR Code Generation
    generateQRCode() {
        const qrContainer = document.getElementById('qrcode');
        let currentUrl = window.location.origin + window.location.pathname + '?view=student';
        
        if (this.sessionId) {
            currentUrl += '&session=' + encodeURIComponent(this.sessionId);
        }
        
        qrContainer.innerHTML = '';
        
        try {
            if (typeof qrcode !== 'undefined') {
                const qr = qrcode(0, 'M');
                qr.addData(currentUrl);
                qr.make();
                
                const qrHTML = qr.createImgTag(4, 8);
                qrContainer.innerHTML = qrHTML;
            } else {
                this.generateQRCodeFallback(currentUrl);
            }
        } catch (error) {
            console.error('Error generating QR code:', error);
            this.generateQRCodeFallback(currentUrl);
        }
        
        document.getElementById('qrUrl').textContent = currentUrl;
    }
    
    generateQRCodeFallback(url) {
        const qrContainer = document.getElementById('qrcode');
        const size = 200;
        const googleChartsUrl = `https://chart.googleapis.com/chart?chs=${size}x${size}&cht=qr&chl=${encodeURIComponent(url)}&choe=UTF-8`;
        
        const img = document.createElement('img');
        img.src = googleChartsUrl;
        img.alt = 'QR Code';
        img.style.width = size + 'px';
        img.style.height = size + 'px';
        img.style.border = '2px solid #667eea';
        img.style.borderRadius = '10px';
        
        img.onerror = () => {
            qrContainer.innerHTML = `
                <div style="width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center; background: #f8f9fa; border: 2px solid #667eea; border-radius: 10px; flex-direction: column; padding: 20px; box-sizing: border-box;">
                    <div style="font-size: 2rem; margin-bottom: 10px;">📱</div>
                    <div style="text-align: center; font-size: 14px; color: #667eea; font-weight: bold;">QR Code</div>
                    <div style="text-align: center; font-size: 12px; color: #666; margin-top: 5px;">Manual URL below</div>
                </div>
            `;
        };
        
        qrContainer.appendChild(img);
    }

    // Random Pick Logic
    startRandomPick() {
        if (!this.isConnected) {
            alert('Please connect to a session first!');
            return;
        }
        
        if (this.students.length === 0) {
            alert('No students registered yet! Students need to scan the QR code and register first.');
            return;
        }
        
        const winnerCount = parseInt(document.getElementById('winnerCount').value);
        
        if (winnerCount > this.students.length) {
            alert(`Cannot pick ${winnerCount} winners from ${this.students.length} students. Please reduce the number of winners.`);
            return;
        }
        
        this.hideAllSections();
        document.getElementById('wheelContainer').classList.remove('hidden');
        
        this.initializeWheel();
        this.startSpinning();
    }

    hideAllSections() {
        document.getElementById('studentsList').classList.add('hidden');
        document.getElementById('resultsContainer').classList.add('hidden');
        document.getElementById('wheelContainer').classList.add('hidden');
    }

    initializeWheel() {
        this.wheelCanvas = document.getElementById('wheel');
        this.wheelCtx = this.wheelCanvas.getContext('2d');
        this.currentRotation = 0;
        
        this.drawWheel();
    }

    drawWheel() {
        const ctx = this.wheelCtx;
        const canvas = this.wheelCanvas;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(centerX, centerY) - 10;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(this.currentRotation);
        
        const studentCount = this.students.length;
        const anglePerSegment = (2 * Math.PI) / studentCount;
        
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
        ];
        
        for (let i = 0; i < studentCount; i++) {
            const startAngle = i * anglePerSegment;
            const endAngle = (i + 1) * anglePerSegment;
            const color = colors[i % colors.length];
            
            ctx.beginPath();
            ctx.arc(0, 0, radius, startAngle, endAngle);
            ctx.lineTo(0, 0);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.save();
            ctx.rotate(startAngle + anglePerSegment / 2);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#333';
            ctx.font = 'bold 12px Arial';
            
            const name = this.students[i].name;
            const truncatedName = name.length > 15 ? name.substring(0, 12) + '...' : name;
            ctx.fillText(truncatedName, radius * 0.3, 5);
            ctx.restore();
        }
        
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, 2 * Math.PI);
        ctx.fillStyle = '#333';
        ctx.fill();
        
        ctx.restore();
    }

    startSpinning() {
        if (this.isSpinning) return;
        
        this.isSpinning = true;
        this.spinDuration = 3000 + Math.random() * 2000;
        this.spinStartTime = Date.now();
        
        document.getElementById('stopWheelBtn').classList.remove('hidden');
        document.getElementById('startPickBtn').style.display = 'none';
        
        this.wheelCanvas.classList.add('spinning');
        this.spinWheel();
    }

    spinWheel() {
        if (!this.isSpinning) return;
        
        const elapsed = Date.now() - this.spinStartTime;
        const progress = Math.min(elapsed / this.spinDuration, 1);
        
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        this.currentRotation += (1 - easeOut) * 0.3;
        this.drawWheel();
        
        if (progress < 1) {
            requestAnimationFrame(() => this.spinWheel());
        } else {
            this.stopWheel();
        }
    }

    stopWheel() {
        this.isSpinning = false;
        this.wheelCanvas.classList.remove('spinning');
        document.getElementById('stopWheelBtn').classList.add('hidden');
        
        setTimeout(() => {
            this.selectWinners();
        }, 500);
    }

    selectWinners() {
        const winnerCount = parseInt(document.getElementById('winnerCount').value);
        const studentCount = this.students.length;
        
        const normalizedRotation = (this.currentRotation % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const pointerAngle = (2 * Math.PI - normalizedRotation + Math.PI / 2) % (2 * Math.PI);
        const segmentSize = (2 * Math.PI) / studentCount;
        const winnerIndex = Math.floor(pointerAngle / segmentSize);
        
        const winners = [];
        const availableStudents = [...this.students];
        
        if (availableStudents[winnerIndex]) {
            winners.push(availableStudents[winnerIndex]);
            availableStudents.splice(winnerIndex, 1);
        }
        
        for (let i = 1; i < winnerCount && availableStudents.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * availableStudents.length);
            winners.push(availableStudents[randomIndex]);
            availableStudents.splice(randomIndex, 1);
        }
        
        this.displayResults(winners);
    }

    displayResults(winners) {
        document.getElementById('wheelContainer').classList.add('hidden');
        document.getElementById('resultsContainer').classList.remove('hidden');
        
        const winnersList = document.getElementById('winnersList');
        winnersList.innerHTML = '';
        
        winners.forEach((winner, index) => {
            const winnerDiv = document.createElement('div');
            winnerDiv.className = 'winner-item';
            winnerDiv.style.animationDelay = `${index * 0.2}s`;
            winnerDiv.innerHTML = `🏆 ${this.escapeHtml(winner.name)}`;
            winnersList.appendChild(winnerDiv);
        });
        
        this.celebrateWinners();
    }

    celebrateWinners() {
        const resultsContainer = document.getElementById('resultsContainer');
        resultsContainer.style.animation = 'none';
        setTimeout(() => {
            resultsContainer.style.animation = 'confetti 0.8s ease-out';
        }, 10);
    }

    resetForNewPick() {
        document.getElementById('resultsContainer').classList.add('hidden');
        document.getElementById('startPickBtn').style.display = 'inline-block';
        this.currentRotation = 0;
        
        if (this.wheelCanvas) {
            this.drawWheel();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize the app
let picker;
document.addEventListener('DOMContentLoaded', () => {
    picker = new StudentPicker();
});

window.picker = picker;
