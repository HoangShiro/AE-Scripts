// ChinhSuaCompDeQuy.jsx
// Tác giả: GPT-4 for Vietnamese user
// Phiên bản: 3.2
// Chức năng: Bắt đầu từ comp đang hoạt động, chỉnh sửa Duration và FPS cho comp đó
// và tất cả các comp lồng nhau bên trong. Xử lý từ comp sâu nhất ra ngoài.
// Kéo dài các layer có thể kéo dài (bao gồm cả Photoshop/ảnh tĩnh) mà không dùng Time Remap.

(function main() {

    // --- FUNCTION ĐỂ TẠO GIAO DIỆN NGƯỜI DÙNG ---
    function createDialog() {
        var dialog = new Window("dialog", "Chỉnh sửa Comp lồng nhau");
        dialog.orientation = "column";
        dialog.alignChildren = ["fill", "top"];
        dialog.spacing = 10;
        dialog.margins = 16;

        var durationPanel = dialog.add("panel", undefined, "Thiết lập Thời lượng");
        durationPanel.orientation = "row";
        durationPanel.alignChildren = ["left", "center"];
        durationPanel.spacing = 10;
        durationPanel.margins = 10;
        durationPanel.add("statictext", undefined, "Thời lượng mới (giây):");
        var durationInput = durationPanel.add("edittext", undefined, "20"); // Thay đổi giá trị mặc định thành 20
        durationInput.minimumSize.width = 60;
        durationInput.active = true;
        durationPanel.add("statictext", undefined, "Số frame lẻ:");
        var frameInput = durationPanel.add("edittext", undefined, "0");
        frameInput.minimumSize.width = 60;

        var fpsPanel = dialog.add("panel", undefined, "Thiết lập Tốc độ khung hình");
        fpsPanel.orientation = "row";
        fpsPanel.alignChildren = ["left", "center"];
        fpsPanel.spacing = 10;
        fpsPanel.margins = 10;
        fpsPanel.add("statictext", undefined, "Frame Rate mới (fps):");
        var fpsInput = fpsPanel.add("edittext", undefined, "60");
        fpsInput.minimumSize.width = 60;

        // --- Logic for validation ---
        var validateFrames = function() {
            var fps = parseFloat(fpsInput.text);
            var frames = parseInt(frameInput.text);

            if (isNaN(fps) || fps <= 0) {
                return; // Cannot validate if FPS is not a valid positive number
            }

            if (isNaN(frames)) {
                return; // Wait for valid number
            }
            
            if (frames < 0) {
                frameInput.text = "0";
                frames = 0;
            }
            
            if (frames > fps) {
                frameInput.text = Math.floor(fps).toString();
            }
        };

        fpsInput.onChanging = validateFrames;
        frameInput.onChanging = validateFrames;
        fpsInput.onChange = validateFrames;
        frameInput.onChange = validateFrames;

        var buttonGroup = dialog.add("group");
        buttonGroup.orientation = "row";
        buttonGroup.alignment = ["right", "top"];
        buttonGroup.add("button", undefined, "OK", { name: "ok" });
        buttonGroup.add("button", undefined, "Hủy", { name: "cancel" });

        if (dialog.show() === 1) {
            validateFrames(); // Run validation one last time before closing
            return { duration: durationInput.text, frames: frameInput.text, fps: fpsInput.text };
        } else {
            return null;
        }
    }

    // --- FUNCTION ĐỆ QUY ĐỂ THU THẬP CÁC COMP THEO THỨ TỰ TỪ SÂU TỚI NÔNG ---
    function collectNestedComps(comp, collectedArray, processedIDs) {
        if (processedIDs[comp.id]) {
            return;
        }
        processedIDs[comp.id] = true;

        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (layer.source && layer.source instanceof CompItem) {
                collectNestedComps(layer.source, collectedArray, processedIDs);
            }
        }
        collectedArray.push(comp);
    }

    // --- SCRIPT CHÍNH BẮT ĐẦU TỪ ĐÂY ---
    var masterComp = app.project.activeItem;
    if (!masterComp || !(masterComp instanceof CompItem)) {
        alert("Vui lòng mở một composition trước khi chạy script này.");
        return;
    }

    var userInput = createDialog();
    if (userInput === null) {
        return;
    }

    var newDurationSecs = parseFloat(userInput.duration);
    var newFrames = parseInt(userInput.frames);
    var newFps = parseFloat(userInput.fps);

    if (isNaN(newDurationSecs) || newDurationSecs < 0 || isNaN(newFrames) || newFrames < 0 || isNaN(newFps) || newFps <= 0) {
        alert("Giá trị không hợp lệ. Thời lượng/Frame phải là số >= 0. FPS phải là số > 0.");
        return;
    }

    var newDuration = newDurationSecs + (newFrames / newFps);

    if (newDuration <= 0) {
        alert("Tổng thời lượng (giây + frame) phải lớn hơn 0.");
        return;
    }

    app.beginUndoGroup("Chỉnh sửa Comp '" + masterComp.name + "' và các comp con");

    var compsToProcess = [];
    var processedCompIDs = {};
    collectNestedComps(masterComp, compsToProcess, processedCompIDs);

    for (var i = 0; i < compsToProcess.length; i++) {
        var currentComp = compsToProcess[i];

        currentComp.duration = newDuration;
        currentComp.frameRate = newFps;

        for (var j = 1; j <= currentComp.numLayers; j++) {
            var currentLayer = currentComp.layer(j);
            var canExtend = false;

            if (!(currentLayer instanceof AVLayer)) {
                // Các layer không có source (Shape, Text, Light, Camera, Null) có thể kéo dài
                canExtend = true;
            } else { // Layer có source (AVLayer)
                var source = currentLayer.source;
                if (source instanceof CompItem) {
                    // Pre-comp có thể kéo dài vì chúng ta đã xử lý source của nó rồi
                    canExtend = true;
                } else if (source instanceof FootageItem) {
                    // FootageItem có thể là Solid hoặc file media
                    if (source.mainSource instanceof SolidSource) {
                        // Layer Solid có thể kéo dài
                        canExtend = true;
                    } 
                    // *** CẬP NHẬT LOGIC TẠI ĐÂY ***
                    // Dấu hiệu nhận biết ảnh tĩnh (PSD, PNG, JPG...) là frameRate của source bằng 0
                    else if (source.frameRate === 0) {
                        canExtend = true;
                    }
                    // Các loại Footage khác (Video, Audio, Image Sequence...) sẽ không được xử lý
                }
            }
            
            if (canExtend) {
                currentLayer.outPoint = newDuration;
            }
        }
    }

    alert("Hoàn tất!\nĐã xử lý thành công " + compsToProcess.length + " compositions, bắt đầu từ '" + masterComp.name + "'.");

    app.endUndoGroup();

})();