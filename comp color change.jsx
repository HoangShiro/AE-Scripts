// comp color change.jsx
// Tác giả: Yuuka (Gemini 3.0 Pro, GPT-5.1-Codex)
// Phiên bản: 2.2
// Chức năng: Đổi màu nền cho comp hiện tại và tùy chọn áp dụng cho tất cả các comp lồng nhau.

(function main() {

    // --- HELPER: Convert RGB (0-1) to Hex ---
    function rgbToHex(r, g, b) {
        var toHex = function(n) {
            var h = Math.round(n * 255).toString(16);
            return h.length === 1 ? "0" + h : h;
        };
        return (toHex(r) + toHex(g) + toHex(b)).toUpperCase();
    }

    // --- HELPER: Convert Hex to RGB (0-1) ---
    function hexToRgb(hex) {
        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? [
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ] : null;
    }

    // --- HELPER: Try both AE and ExtendScript color pickers ---
    function openColorPicker(currentColor) {
        var picked = null;

        // Try AE's native picker first (works on most modern versions)
        if (app && typeof app.colorPicker === "function") {
            try {
                picked = app.colorPicker(currentColor);
            } catch (e) {
                // Swallow the error so we can fall back to $.colorPicker below
            }
        }

        // Fallback: ExtendScript's cross-host picker (available since CS6)
        if ((!picked || !picked.length) && typeof $.colorPicker === "function") {
            var seedHex = rgbToHex(currentColor[0], currentColor[1], currentColor[2]);
            var seedValue = parseInt(seedHex, 16);
            var fallback = $.colorPicker(seedValue);
            if (fallback !== -1) {
                picked = [
                    ((fallback >> 16) & 255) / 255,
                    ((fallback >> 8) & 255) / 255,
                    (fallback & 255) / 255
                ];
            }
        }

        return picked;
    }

    // --- HELPER: Thu thập các comp lồng nhau ---
    function collectNestedComps(comp, collectedArray, processedIDs) {
        if (processedIDs[comp.id]) return;
        processedIDs[comp.id] = true;

        // Duyệt qua các layer để tìm pre-comp
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.source && layer.source instanceof CompItem) {
                collectNestedComps(layer.source, collectedArray, processedIDs);
            }
        }
        // Thêm comp hiện tại vào danh sách
        collectedArray.push(comp);
    }

    // --- UI: Tạo hộp thoại ---
    function createDialog(masterComp) {
        var dialogTitle = "Đổi màu nền cho comp " + masterComp.name;
        var dialog = new Window("dialog", dialogTitle);
        dialog.orientation = "column";
        dialog.alignChildren = ["fill", "top"];
        dialog.spacing = 10;
        dialog.margins = 16;

        var currentColor = masterComp.bgColor; // Mảng [r, g, b] từ 0-1

        // --- PANEL CHỌN MÀU ---
        var colorPanel = dialog.add("panel", undefined, "Màu nền");
        colorPanel.orientation = "row";
        colorPanel.alignChildren = ["left", "center"];
        colorPanel.spacing = 15;

        // Group chứa Preview + Hex
        var colorGroup = colorPanel.add("group");
        colorGroup.orientation = "column";
        colorGroup.alignChildren = ["center", "center"];
        colorGroup.spacing = 5;

        // Preview màu (Lớn hơn chút)
        var previewGroup = colorGroup.add("group", [0, 0, 60, 60]);
        previewGroup.onDraw = function() {
            var g = this.graphics;
            var brush = g.newBrush(g.BrushType.SOLID_COLOR, [currentColor[0], currentColor[1], currentColor[2], 1]);
            g.drawOSControl();
            g.rectPath(0, 0, this.size.width, this.size.height);
            g.fillPath(brush);
            g.strokePath(g.newPen(g.PenType.SOLID_COLOR, [0,0,0,1], 1)); // Border
        }

        // Hex Input
        var hexInput = colorGroup.add("edittext", undefined, rgbToHex(currentColor[0], currentColor[1], currentColor[2]));
        hexInput.characters = 7;
        hexInput.helpTip = "Nhập mã màu Hex (VD: #FFFFFF)";

        // Nút chọn màu (System Picker)
        var pickBtn = colorPanel.add("button", undefined, "Mở bảng màu...");
        pickBtn.size = [120, 30];
        pickBtn.helpTip = "Mở bảng chọn màu của hệ thống";
        
        // --- Event Handlers ---
        var updatePreview = function() {
             previewGroup.visible = false;
             previewGroup.visible = true;
        }

        pickBtn.onClick = function() {
            var pickedColor = openColorPicker([
                parseFloat(currentColor[0]),
                parseFloat(currentColor[1]),
                parseFloat(currentColor[2])
            ]);

            if (pickedColor) {
                currentColor = pickedColor;
                hexInput.text = rgbToHex(currentColor[0], currentColor[1], currentColor[2]);
                updatePreview();
            }
        };

        hexInput.onChange = function() {
            var newRgb = hexToRgb(this.text);
            if (newRgb) {
                currentColor = newRgb;
                updatePreview();
            } else {
                // Revert if invalid
                this.text = rgbToHex(currentColor[0], currentColor[1], currentColor[2]);
            }
        }

        // --- PANEL TÙY CHỌN ---
        var optionsPanel = dialog.add("panel", undefined, "Phạm vi áp dụng");
        optionsPanel.orientation = "column";
        optionsPanel.alignChildren = ["left", "top"];

        var recursiveCheckbox = optionsPanel.add("checkbox", undefined, "Áp dụng cho tất cả comp con (Nested Comps)");
        recursiveCheckbox.value = true;
        recursiveCheckbox.helpTip = "Nếu chọn, màu nền sẽ được áp dụng cho comp hiện tại và tất cả các pre-comp bên trong nó.";

        // --- BUTTONS ---
        var btnGroup = dialog.add("group");
        btnGroup.orientation = "row";
        btnGroup.alignment = ["right", "top"];
        btnGroup.add("button", undefined, "OK", { name: "ok" });
        btnGroup.add("button", undefined, "Hủy", { name: "cancel" });

        if (dialog.show() === 1) {
            return {
                color: currentColor,
                isRecursive: recursiveCheckbox.value
            };
        } else {
            return null;
        }
    }

    // --- MAIN LOGIC ---
    var masterComp = app.project.activeItem;
    if (!masterComp || !(masterComp instanceof CompItem)) {
        alert("Vui lòng chọn một Composition trước khi chạy script.");
        return;
    }

    var result = createDialog(masterComp);
    if (!result) return;

    app.beginUndoGroup("Đổi màu nền Comp & Nested");

    var compsToProcess = [];
    if (result.isRecursive) {
        var processedIDs = {};
        collectNestedComps(masterComp, compsToProcess, processedIDs);
    } else {
        compsToProcess.push(masterComp);
    }

    var count = 0;
    for (var i = 0; i < compsToProcess.length; i++) {
        compsToProcess[i].bgColor = result.color;
        count++;
    }

    app.endUndoGroup();
    
    // alert("Hoàn tất! Đã đổi màu cho " + count + " composition(s).");

})();
