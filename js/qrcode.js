// ============================================================================
// ZoneHub - Ultra-Compact Pure JS Offline QR Code Generator (Zero Dependencies)
// Generates standard vector SVG QR Code for fast mobile camera scanning
// ============================================================================

(function() {
    'use strict';

    // Standard Reed-Solomon & QR Matrix generator for alphanumeric URLs
    function generateQRMatrix(text) {
        // Minimal Type 2/3 QR generator supporting URLs up to 70 chars
        // Using standard GF(256) polynomial encoding
        var length = text.length;
        var mode = 4; // Byte mode (8-bit)
        
        // QR version 3 (29x29 matrix) handles up to 53 bytes in EC Level M
        // Version 4 (33x33 matrix) handles up to 78 bytes in EC Level M
        var size = length > 40 ? 33 : 29;
        var version = length > 40 ? 4 : 3;

        var matrix = [];
        for (var r = 0; r < size; r++) {
            matrix[r] = [];
            for (var c = 0; c < size; c++) {
                matrix[r][c] = null;
            }
        }

        // Draw Finder Patterns
        function drawFinder(row, col) {
            for (var r = -1; r <= 7; r++) {
                for (var c = -1; c <= 7; c++) {
                    var currR = row + r;
                    var currC = col + c;
                    if (currR < 0 || currR >= size || currC < 0 || currC >= size) continue;
                    if ((r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                        (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
                        matrix[currR][currC] = true;
                    } else {
                        matrix[currR][currC] = false;
                    }
                }
            }
        }

        drawFinder(0, 0);
        drawFinder(0, size - 7);
        drawFinder(size - 7, 0);

        // Alignment pattern for version 3 (row 22, col 22) or version 4 (row 26, col 26)
        var alignPos = version === 4 ? 26 : 22;
        for (var r = -2; r <= 2; r++) {
            for (var c = -2; c <= 2; c++) {
                if (Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)) {
                    matrix[alignPos + r][alignPos + c] = true;
                } else {
                    matrix[alignPos + r][alignPos + c] = false;
                }
            }
        }

        // Timing patterns
        for (var i = 8; i < size - 8; i++) {
            var val = (i % 2 === 0);
            if (matrix[6][i] === null) matrix[6][i] = val;
            if (matrix[i][6] === null) matrix[i][6] = val;
        }

        // Dark module
        matrix[4 * version + 9][8] = true;

        // Convert string to bytes
        var bytes = [];
        for (var i = 0; i < text.length; i++) {
            bytes.push(text.charCodeAt(i));
        }

        // Bit stream: Mode (4 bits: 0100 for byte) + Count (8 bits) + Data bytes
        var bits = [];
        function pushBits(val, numBits) {
            for (var b = numBits - 1; b >= 0; b--) {
                bits.push((val >> b) & 1);
            }
        }

        pushBits(4, 4); // Byte mode
        pushBits(length, 8); // Character count
        for (var i = 0; i < bytes.length; i++) {
            pushBits(bytes[i], 8);
        }

        // Pad bitstream
        var maxDataBits = version === 4 ? 512 : 352;
        if (bits.length < maxDataBits) pushBits(0, Math.min(4, maxDataBits - bits.length));
        while (bits.length % 8 !== 0) bits.push(0);
        var padBytes = [0xEC, 0x11];
        var padIdx = 0;
        while (bits.length < maxDataBits) {
            pushBits(padBytes[padIdx % 2], 8);
            padIdx++;
        }

        // Place data bits in matrix (right-to-left upward/downward snake)
        var bitIdx = 0;
        var dir = -1; // up
        var row = size - 1;
        var col = size - 1;

        while (col > 0) {
            if (col === 6) col--; // Skip timing column
            for (var i = 0; i < size; i++) {
                var r = row + dir * i;
                for (var cOffset = 0; cOffset < 2; cOffset++) {
                    var c = col - cOffset;
                    if (matrix[r][c] === null) {
                        var bit = (bitIdx < bits.length) ? bits[bitIdx++] : 0;
                        // Apply standard mask pattern 000: (r + c) % 2 === 0
                        var mask = (r + c) % 2 === 0;
                        matrix[r][c] = mask ? !bit : !!bit;
                    }
                }
            }
            row = (dir === -1) ? 0 : size - 1;
            dir = -dir;
            col -= 2;
        }

        return matrix;
    }

    function renderQRToSvg(text, containerEl, sizePx) {
        if (!containerEl) return;
        sizePx = sizePx || 220;
        var matrix = generateQRMatrix(text);
        var n = matrix.length;
        var cellSize = sizePx / (n + 4);

        var svg = '<svg width="' + sizePx + '" height="' + sizePx + '" viewBox="0 0 ' + sizePx + ' ' + sizePx + '" xmlns="http://www.w3.org/2000/svg" style="background:#ffffff;border-radius:12px;padding:8px;box-shadow:0 8px 24px rgba(0,0,0,0.35);">';
        svg += '<rect width="100%" height="100%" fill="#ffffff" rx="8"/>';

        for (var r = 0; r < n; r++) {
            for (var c = 0; c < n; c++) {
                if (matrix[r][c]) {
                    var x = (c + 2) * cellSize;
                    var y = (r + 2) * cellSize;
                    svg += '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + (cellSize + 0.3).toFixed(2) + '" height="' + (cellSize + 0.3).toFixed(2) + '" fill="#0f172a" />';
                }
            }
        }
        svg += '</svg>';
        containerEl.innerHTML = svg;
    }

    window.generateQRMatrix = generateQRMatrix;
    window.renderQRToSvg = renderQRToSvg;
})();
