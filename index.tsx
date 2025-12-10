import { GoogleGenAI } from "@google/genai";
import { TrafficData, DataPoint, RegressionResult, ViewState } from './types';
import { parseVolumes, calculateLinear, calculateExponential, calculateLogarithmic } from './utils';

// Declare Chart.js type for TS (assuming loaded via CDN globally)
declare const Chart: any;
declare const window: any; // Allow access to jspdf on window

// State with Default Values
let currentState: ViewState = 'HOME';
let trafficData: TrafficData = {
    road: 'México - Querétaro',
    section: 'Palmillas - Querétaro',
    station: 'E-01',
    km: '150+000',
    direction: 'S1',
    latestYear: 2024,
    // Default volumes: 2024->5200, 2023->5100, etc.
    rawVolumes: '5200\t5100\t4950\t4800\t4650\t4500' 
};
let parsedPoints: DataPoint[] = [];
let regressions: {
    linear: RegressionResult | null;
    exponential: RegressionResult | null;
    logarithmic: RegressionResult | null;
} = { linear: null, exponential: null, logarithmic: null };

// Chart Instances Storage to destroy them before re-rendering
const charts: { [key: string]: any } = {};

// --- Navigation Logic ---

function navigateTo(view: ViewState) {
    // Update State
    currentState = view;

    // Update Navbar Buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-target') === view.toLowerCase()) {
            btn.classList.add('active');
        }
    });

    // Hide all sections
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.add('hidden');
    });

    // Show target section
    const targetSection = document.getElementById(`view-${view.toLowerCase()}`);
    if (targetSection) {
        targetSection.classList.remove('hidden');
        
        // Trigger specific view renders
        if (view === 'LINEAR') renderRegressionView('linear');
        if (view === 'EXPONENTIAL') renderRegressionView('exponential');
        if (view === 'LOGARITHMIC') renderRegressionView('logarithmic');
    }
}

// --- Data Handling ---

function handleProcessData() {
    // Gather inputs
    trafficData.road = (document.getElementById('input-road') as HTMLInputElement).value;
    trafficData.section = (document.getElementById('input-section') as HTMLInputElement).value;
    trafficData.station = (document.getElementById('input-station') as HTMLInputElement).value;
    trafficData.km = (document.getElementById('input-km') as HTMLInputElement).value;
    trafficData.direction = (document.getElementById('input-direction') as HTMLSelectElement).value as any;
    trafficData.latestYear = parseInt((document.getElementById('input-year') as HTMLInputElement).value) || new Date().getFullYear();
    trafficData.rawVolumes = (document.getElementById('input-volumes') as HTMLTextAreaElement).value;

    // Parse
    parsedPoints = parseVolumes(trafficData.latestYear, trafficData.rawVolumes);

    // Calculate Regressions immediately
    regressions.linear = calculateLinear(parsedPoints);
    regressions.exponential = calculateExponential(parsedPoints);
    regressions.logarithmic = calculateLogarithmic(parsedPoints);

    // Render Data Table
    renderDataTable();

    // Show feedback
    if (parsedPoints.length > 0) {
        document.getElementById('data-results')?.classList.remove('hidden');
    } else {
        alert('Por favor ingrese volúmenes válidos.');
    }
}

function renderDataTable() {
    const tbody = document.getElementById('table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    parsedPoints.forEach(p => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-50 hover:bg-slate-50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-slate-900">${p.year}</td>
            <td class="px-6 py-4 text-right font-mono">${p.volume.toLocaleString()}</td>
            <td class="px-6 py-4 text-right ${p.growthRate && p.growthRate < 0 ? 'text-red-500' : 'text-green-600'}">
                ${p.growthRate !== undefined ? p.growthRate.toFixed(2) + '%' : '-'}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Regression Rendering ---

function renderRegressionView(type: 'linear' | 'exponential' | 'logarithmic') {
    const containerId = `view-${type}`;
    const container = document.getElementById(containerId);
    if (!container) return;

    // Clear previous content
    container.innerHTML = '';

    const result = regressions[type];
    if (!result || result.points.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-slate-500">No hay datos suficientes. Por favor vaya a la pestaña "Datos" e ingrese información.</div>`;
        return;
    }

    // Clone Template
    const template = document.getElementById('template-regression') as HTMLDivElement;
    const content = template.firstElementChild?.cloneNode(true) as HTMLElement;
    
    // Fill Content
    const titles = { linear: 'Regresión Lineal', exponential: 'Regresión Exponencial', logarithmic: 'Regresión Logarítmica' };
    const descs = { 
        linear: 'Modelo de crecimiento constante (y = mx + b).', 
        exponential: 'Modelo de crecimiento proporcional (y = Ae^Bx).', 
        logarithmic: 'Modelo de crecimiento desacelerado (y = a + b ln(x)).' 
    };

    content.querySelector('.regression-title')!.textContent = titles[type];
    content.querySelector('.regression-desc')!.textContent = descs[type];
    content.querySelector('.regression-rate')!.textContent = `${result.growthRate.toFixed(2)}%`;
    content.querySelector('.regression-formula')!.textContent = result.formula;
    content.querySelector('.regression-r2')!.textContent = result.rSquared.toFixed(4);
    
    // Update R2 Bar
    const r2Bar = content.querySelector('.regression-r2-bar') as HTMLElement;
    r2Bar.style.width = `${Math.min(result.rSquared * 100, 100)}%`;
    // Color coding for R2
    if(result.rSquared < 0.5) r2Bar.classList.replace('bg-green-500', 'bg-red-500');
    else if(result.rSquared < 0.8) r2Bar.classList.replace('bg-green-500', 'bg-yellow-500');

    container.appendChild(content);

    // Render Chart
    const canvas = content.querySelector('.regression-chart') as HTMLCanvasElement;
    renderChart(canvas, result, type);
}

function renderChart(canvas: HTMLCanvasElement, result: RegressionResult, type: string) {
    if (charts[type]) {
        charts[type].destroy();
    }

    const ctx = canvas.getContext('2d');
    const labels = result.points.map(p => p.x);
    const rawData = result.points.map(p => p.y);
    const trendData = result.points.map(p => p.yPred);

    charts[type] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Datos Históricos',
                    data: rawData,
                    borderColor: '#94a3b8', // Slate 400
                    backgroundColor: '#94a3b8',
                    type: 'scatter',
                    pointRadius: 6,
                    pointHoverRadius: 8
                },
                {
                    label: `Tendencia (${result.type})`,
                    data: trendData,
                    borderColor: '#2563eb', // Blue 600
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 3,
                    pointRadius: 0,
                    fill: false,
                    tension: type === 'lineal' ? 0 : 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    title: { display: true, text: 'Volumen (TDPA)' }
                },
                x: {
                    title: { display: true, text: 'Año' }
                }
            }
        }
    });
}

// --- AI Interpretation ---

async function handleGenerateAI() {
    if (parsedPoints.length === 0) {
        alert("Por favor ingrese datos primero.");
        return;
    }

    const loader = document.getElementById('ai-loading');
    const resultBox = document.getElementById('ai-result');
    const contentBox = document.getElementById('ai-content');

    loader?.classList.remove('hidden');
    resultBox?.classList.add('hidden');

    try {
        const prompt = `
            Actúa como un Ingeniero de Tránsito experto. Analiza los siguientes datos de volúmenes vehiculares (TDPA) para la carretera "${trafficData.road}", tramo "${trafficData.section}", km "${trafficData.km}".
            
            Datos históricos (Año: Volumen):
            ${parsedPoints.map(p => `${p.year}: ${p.volume}`).join(', ')}

            Resultados de Regresiones:
            1. Lineal: R²=${regressions.linear?.rSquared.toFixed(4)}, Tasa Crecimiento=${regressions.linear?.growthRate.toFixed(2)}%
            2. Exponencial: R²=${regressions.exponential?.rSquared.toFixed(4)}, Tasa Crecimiento=${regressions.exponential?.growthRate.toFixed(2)}%
            3. Logarítmica: R²=${regressions.logarithmic?.rSquared.toFixed(4)}, Tasa Crecimiento=${regressions.logarithmic?.growthRate.toFixed(2)}%

            Tarea:
            1. Describe brevemente el comportamiento histórico de los datos (creciente, decreciente, estable, fluctuante).
            2. Compara los coeficientes de correlación (R²).
            3. Selecciona el modelo que mejor se ajusta y justifica técnicamente tu elección.
            4. Recomienda cuál tasa de crecimiento adoptar para proyecciones futuras.
        `;

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        if (contentBox) contentBox.innerText = response.text || "No se pudo generar la interpretación.";
        resultBox?.classList.remove('hidden');

    } catch (error) {
        console.error("AI Error:", error);
        alert("Error al contactar a la IA. Verifique su conexión o API Key.");
    } finally {
        loader?.classList.add('hidden');
    }
}

// --- PDF Generation ---

async function handleDownloadPDF() {
    if (parsedPoints.length === 0) {
        alert("No hay datos para generar el reporte. Por favor procese los datos primero.");
        return;
    }

    // Ensure jsPDF is loaded
    if (!window.jspdf) {
        alert("La librería PDF aún no ha cargado. Intente de nuevo en un momento.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;

    // --- Page 1: Cover and Data ---
    
    // Header
    doc.setFillColor(37, 99, 235); // Blue 600
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("Memoria Ejecutiva: Modelos de Regresión", margin, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text("Ingeniería de Tránsito - Análisis de Crecimiento", margin, 30);

    // Developer Info
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(10);
    doc.text(`Generado por: M.en I. Ing. Martín Olvera Corona`, margin, 50);
    doc.text(`Contacto: incimoc@gmail.com`, margin, 55);
    doc.text(`Fecha: ${new Date().toLocaleDateString()}`, margin, 60);

    // Metadata Table
    const metaData = [
        ['Carretera', trafficData.road],
        ['Tramo', trafficData.section],
        ['Estación', trafficData.station],
        ['Km', trafficData.km],
        ['Sentido', trafficData.direction]
    ];
    
    doc.autoTable({
        startY: 70,
        head: [['Parámetro', 'Valor']],
        body: metaData,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85] }, // Slate 700
    });

    // Historical Data Table
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Datos Históricos", margin, doc.lastAutoTable.finalY + 15);

    const tableData = parsedPoints.map(p => [
        p.year, 
        p.volume.toLocaleString(), 
        p.growthRate !== undefined ? `${p.growthRate.toFixed(2)}%` : '-'
    ]);

    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 20,
        head: [['Año', 'TDPA (Veh)', 'Tasa Crecimiento (%)']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] },
    });

    // --- Helper to Generate Chart Image ---
    const generateChartImage = async (result: RegressionResult, type: string): Promise<string> => {
        const canvas = document.getElementById('pdf-canvas') as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if(!ctx) return '';
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const labels = result.points.map(p => p.x);
        const rawData = result.points.map(p => p.y);
        const trendData = result.points.map(p => p.yPred);

        // Create temporary chart
        return new Promise((resolve) => {
            const tempChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Datos Históricos',
                            data: rawData,
                            borderColor: '#94a3b8',
                            backgroundColor: '#94a3b8',
                            type: 'scatter',
                            pointRadius: 6
                        },
                        {
                            label: `Tendencia`,
                            data: trendData,
                            borderColor: '#2563eb',
                            borderWidth: 3,
                            pointRadius: 0,
                            fill: false,
                            tension: type === 'lineal' ? 0 : 0.4
                        }
                    ]
                },
                options: {
                    responsive: false,
                    animation: false, // Important for instant capture
                    scales: {
                        y: { beginAtZero: false, title: {display: true, text: 'TDPA'} },
                        x: { title: {display: true, text: 'Año'} }
                    },
                    plugins: { legend: { position: 'bottom' } }
                }
            });

            // Allow render cycle to complete
            setTimeout(() => {
                const imgData = canvas.toDataURL('image/png');
                tempChart.destroy();
                resolve(imgData);
            }, 100);
        });
    };

    // --- Regression Pages ---
    
    const models: {key: 'linear' | 'exponential' | 'logarithmic', name: string}[] = [
        {key: 'linear', name: 'Regresión Lineal'},
        {key: 'exponential', name: 'Regresión Exponencial'},
        {key: 'logarithmic', name: 'Regresión Logarítmica'}
    ];

    for (const model of models) {
        const result = regressions[model.key];
        if (result) {
            doc.addPage();
            
            // Title
            doc.setFillColor(241, 245, 249); // Slate 100
            doc.rect(0, 0, pageWidth, 30, 'F');
            doc.setTextColor(30, 41, 59);
            doc.setFontSize(18);
            doc.setFont("helvetica", "bold");
            doc.text(model.name, margin, 20);

            // Stats
            doc.setFontSize(12);
            doc.setFont("helvetica", "normal");
            doc.text(`Fórmula: ${result.formula}`, margin, 50);
            doc.text(`Coeficiente R²: ${result.rSquared.toFixed(4)}`, margin, 60);
            doc.text(`Tasa Media Anual: ${result.growthRate.toFixed(2)}%`, margin, 70);

            // Chart
            const imgData = await generateChartImage(result, model.key);
            if (imgData) {
                // Fit image (800x400 canvas -> approx 180x90 mm)
                doc.addImage(imgData, 'PNG', margin, 80, 180, 90);
            }
        }
    }

    // --- Interpretation Page ---
    const aiText = document.getElementById('ai-content')?.innerText;
    if (aiText && aiText.trim() !== '') {
        doc.addPage();
        doc.setFillColor(241, 245, 249);
        doc.rect(0, 0, pageWidth, 30, 'F');
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("Interpretación Inteligente", margin, 20);

        doc.setFontSize(11);
        doc.setFont("helvetica", "normal");
        
        // Simple text wrapping
        const splitText = doc.splitTextToSize(aiText, pageWidth - (margin * 2));
        doc.text(splitText, margin, 50);
    }

    doc.save('Memoria_Ejecutiva_Transito.pdf');
}


// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    // Navigation Listeners
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const target = (e.currentTarget as HTMLElement).getAttribute('data-target');
            if (target) navigateTo(target.toUpperCase() as ViewState);
        });
    });

    // Data Processing Listener
    document.getElementById('btn-process-data')?.addEventListener('click', handleProcessData);

    // AI Generation Listener
    document.getElementById('btn-generate-ai')?.addEventListener('click', handleGenerateAI);

    // PDF Listeners (Card and Button)
    document.getElementById('btn-download-pdf-card')?.addEventListener('click', handleDownloadPDF);
    document.getElementById('btn-download-pdf-alt')?.addEventListener('click', handleDownloadPDF);

    // Populate Inputs with Default Data
    (document.getElementById('input-road') as HTMLInputElement).value = trafficData.road;
    (document.getElementById('input-section') as HTMLInputElement).value = trafficData.section;
    (document.getElementById('input-station') as HTMLInputElement).value = trafficData.station;
    (document.getElementById('input-km') as HTMLInputElement).value = trafficData.km;
    (document.getElementById('input-direction') as HTMLSelectElement).value = trafficData.direction;
    (document.getElementById('input-year') as HTMLInputElement).value = trafficData.latestYear.toString();
    (document.getElementById('input-volumes') as HTMLTextAreaElement).value = trafficData.rawVolumes;
    
    // Initial View and Process Data
    handleProcessData(); // Auto-calculate on load
    navigateTo('HOME');
});
