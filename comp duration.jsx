// comp duration.jsx
// Tác giả: GPT-4 for Vietnamese user (Updated by Yuuka)
// Phiên bản: 6.6
// Chức năng: Bắt đầu từ comp đang hoạt động, chỉnh sửa Duration và FPS cho comp đó
// và tất cả các comp lồng nhau bên trong. Xử lý từ comp sâu nhất ra ngoài.
// Kéo dài các layer có thể kéo dài (bao gồm cả Photoshop/ảnh tĩnh) mà không dùng Time Remap.
// Giao diện có hiển thị thông tin so sánh và danh sách các item bị ảnh hưởng.
//
// Update v6.6 (Yuuka):
// - [CẢI TIẾN] Sửa lỗi hiển thị ký tự lạ ("%") trong đường dẫn backup.
// - [CẢI TIẾN] Tự động rút gọn đường dẫn backup hiển thị cho gọn gàng (chỉ hiển thị 5 thư mục cuối).
// - [CẢI TIẾN] Thêm tooltip hiển thị đường dẫn đầy đủ khi di chuột vào đường dẫn backup.
//
// Update v6.5 (Yuuka):
// - [TÍNH NĂNG MỚI] Thêm tùy chọn tự động backup project trước khi thực thi.

(function main() {

    // --- HELPER FUNCTION ĐỂ FORMAT THỜI GIAN (mm:ss:ff) ---
    function formatTime(timeInSeconds, fps) {
        if (isNaN(timeInSeconds) || isNaN(fps) || fps <= 0) {
            return "00:00:00";
        }
        var totalFrames = Math.round(timeInSeconds * fps);
        var frames = totalFrames % Math.round(fps);
        var totalSeconds = Math.floor(totalFrames / fps);
        var seconds = totalSeconds % 60;
        var minutes = Math.floor(totalSeconds / 60);

        var mStr = (minutes < 10 ? "0" : "") + minutes;
        var sStr = (seconds < 10 ? "0" : "") + seconds;
        var fStr = (frames < 10 ? "0" : "") + frames;

        return mStr + ":" + sStr + ":" + fStr;
    }

    // --- FUNCTION ĐỂ KIỂM TRA LAYER CÓ THỂ KÉO DÀI ĐƯỢỢC KHÔNG ---
    function canLayerBeExtended(layer) {
        if (!(layer instanceof AVLayer)) {
            // Các layer không có source (Shape, Text, Light, Camera, Null)
            return true;
        }
        var source = layer.source;
        if (source instanceof CompItem) {
            // Pre-comp
            return true;
        }
        if (source instanceof FootageItem) {
            if (source.mainSource instanceof SolidSource) {
                // Layer Solid
                return true;
            }
            if (source.frameRate === 0) {
                // Ảnh tĩnh (PSD, PNG, JPG...)
                return true;
            }
        }
        // Video, Audio, Image Sequence...
        return false;
    }
    
    // --- FUNCTION ĐỂ KIỂM TRA COMP CÓ ITEM CON CÓ THỂ XỬ LÝ KHÔNG ---
    function hasListableChildren(comp) {
        for (var i = 1; i <= comp.numLayers; i++) {
            var layer = comp.layer(i);
            if (canLayerBeExtended(layer) || (layer.source && layer.source instanceof CompItem)) {
                return true;
            }
        }
        return false;
    }


    // --- FUNCTION ĐỂ TẠO GIAO DIỆN NGƯỜI DÙNG ---
    function createDialog(masterComp) {
        var dialog = new Window("dialog", "Chỉnh sửa duration v6.6");
        dialog.orientation = "column";
        dialog.alignChildren = ["fill", "top"];
        dialog.spacing = 10;
        dialog.margins = 16;

        var oldDuration = masterComp.duration;
        var oldFps = masterComp.frameRate;

        // --- PANEL CHỈNH SỬA ---
        var editPanel = dialog.add("panel", undefined, "Chỉnh sửa");
        editPanel.orientation = "row";
        editPanel.alignChildren = ["left", "center"];
        editPanel.spacing = 10;
        editPanel.margins = 10;

        var defaultDurationSecs = Math.floor(oldDuration);
        var defaultFrames = Math.round((oldDuration - defaultDurationSecs) * oldFps);

        editPanel.add("statictext", undefined, "Second(giây)");
        var durationInput = editPanel.add("edittext", undefined, defaultDurationSecs.toString());
        durationInput.minimumSize.width = 60;
        durationInput.active = true;

        editPanel.add("statictext", undefined, "+");
        var frameInput = editPanel.add("edittext", undefined, defaultFrames.toString());
        frameInput.minimumSize.width = 60;
        editPanel.add("statictext", undefined, "frame");

        editPanel.add("statictext", undefined, "FPS");
        var fpsInput = editPanel.add("edittext", undefined, oldFps.toString());
        fpsInput.minimumSize.width = 60;

        // --- PANEL THÔNG TIN COMP ---
        var infoPanel = dialog.add("panel", undefined, "Main comp");
        infoPanel.alignment = "fill";
        var infoText = infoPanel.add("statictext", undefined, "Loading...", { multiline: false });
        infoText.preferredSize.width = 400;

        // --- PANEL DANH SÁCH COMPS & LAYERS BỊ ẢNH HƯỞNG ---
        var allCompsPanel = dialog.add("panel", undefined, "Comps & Layers (Click để Toggle)");
        allCompsPanel.alignment = "fill";
        var compTree = allCompsPanel.add("listbox", undefined, [], {
            numberOfColumns: 5,
            showHeaders: true,
            columnTitles: ["#", "Tên Item", "Duration Cũ", "Duration Mới", "Active"]
        });
        compTree.alignment = "fill";
        compTree.columnWidths = [30, 450, 100, 100, 50];
        compTree.preferredSize.height = 450;
        compTree.preferredSize.width = 550;

        // --- DATA CACHE: Xây dựng một cây ảo chứa tất cả các item ---
        var allItemsCache = [];

        function buildCache(comp, indent, parentCacheID, processedIDs) {
            if (processedIDs[comp.id]) return;
            processedIDs[comp.id] = true;

            var hasChildren = hasListableChildren(comp);
            var togglerCacheID = -1;

            if (hasChildren) {
                var togglerItem = {
                    type: 'toggler',
                    text: indent + "-+----------------------------+-",
                    ae_id: comp.id,
                    parentCacheID: parentCacheID,
                    isExpanded: false,
                    indent: indent,
                    cacheID: allItemsCache.length
                };
                allItemsCache.push(togglerItem);
                togglerCacheID = togglerItem.cacheID;
            }

            var compItemData = {
                type: 'comp',
                text: indent + (hasChildren ? "  " : "") + "[COMP] " + comp.name,
                durationOld: formatTime(comp.duration, comp.frameRate),
                isActive: true,
                ae_id: comp.id,
                parentCacheID: parentCacheID,
                indent: indent + (hasChildren ? "  " : ""),
                cacheID: allItemsCache.length
            };
            allItemsCache.push(compItemData);

            for (var i = 1; i <= comp.numLayers; i++) {
                var layer = comp.layer(i);
                var isExtendable = canLayerBeExtended(layer);
                var isNestedComp = layer.source && layer.source instanceof CompItem;

                if (isExtendable || isNestedComp) {
                    var layerItemData = {
                        type: 'layer',
                        text: compItemData.indent + "  - " + layer.name,
                        durationOld: formatTime(layer.outPoint - layer.inPoint, comp.frameRate),
                        isActive: true,
                        ae_id: layer.id,
                        parentCacheID: togglerCacheID,
                        indent: compItemData.indent + "  ",
                        cacheID: allItemsCache.length
                    };
                    allItemsCache.push(layerItemData);
                }

                if (isNestedComp) {
                    buildCache(layer.source, compItemData.indent + "    ", togglerCacheID, processedIDs);
                }
            }
        }

        // --- FUNCTION ĐỂ VẼ LẠI DANH SÁCH TỪ CACHE ---
        function renderList(newDurationStr) {
            compTree.removeAll();
            var visibleItemCounter = 1;

            for (var i = 0; i < allItemsCache.length; i++) {
                var itemData = allItemsCache[i];
                var isVisible = true;

                if (itemData.parentCacheID !== -1) {
                    var currentParentID = itemData.parentCacheID;
                    while(currentParentID !== -1) {
                        var ancestor = allItemsCache[currentParentID];
                        if (!ancestor.isExpanded) {
                            isVisible = false;
                            break;
                        }
                        currentParentID = ancestor.parentCacheID;
                    }
                }
                
                if (isVisible) {
                    var listItem;
                    if (itemData.type === 'toggler') {
                        listItem = compTree.add("item", "");
                        listItem.subItems[0].text = itemData.text;
                    } else {
                        listItem = compTree.add("item", visibleItemCounter.toString());
                        listItem.subItems[0].text = itemData.text;
                        listItem.subItems[1].text = itemData.durationOld;
                        listItem.subItems[2].text = newDurationStr;
                        listItem.subItems[3].text = itemData.isActive ? "✓" : "";
                        visibleItemCounter++;
                    }
                    listItem.cacheIndex = itemData.cacheID;
                }
            }
        }
        
        var getNewDurationStr = function() {
             var secs = parseFloat(durationInput.text) || 0;
             var frames = parseInt(frameInput.text) || 0;
             var fps = parseFloat(fpsInput.text) || oldFps;
             if (fps <= 0) fps = oldFps;
             var newDuration = secs + (frames / fps);
             return formatTime(newDuration, fps);
        }

        buildCache(masterComp, "", -1, {});
        renderList(getNewDurationStr());

        var updateUI = function() {
            var secs = parseFloat(durationInput.text);
            var frames = parseInt(frameInput.text);
            var fps = parseFloat(fpsInput.text);

            if (isNaN(secs)) secs = 0;
            if (isNaN(frames)) frames = 0;
            if (isNaN(fps) || fps <= 0) {
                fps = oldFps;
            }

            if (frames < 0) {
                frameInput.text = "0";
                frames = 0;
            }
            if (frames >= fps) {
                var maxFrames = Math.floor(fps - 1);
                frameInput.text = maxFrames < 0 ? "0" : maxFrames.toString();
                frames = maxFrames < 0 ? 0 : maxFrames;
            }

            var newDuration = secs + (frames / fps);
            if (newDuration < 0) newDuration = 0;

            var oldInfo = formatTime(oldDuration, oldFps) + "/" + oldFps + "fps";
            var newInfo = formatTime(newDuration, fps) + "/" + fps + "fps";
            infoText.text = masterComp.name + " - Old: " + oldInfo + " -> New: " + newInfo;
            
            renderList(formatTime(newDuration, fps));
        };

        // --- EVENT HANDLER CHO DANH SÁCH ---
        compTree.onChange = function() {
            if (!this.selection) return;
            var selectedCacheIndex = this.selection.cacheIndex;
            var itemData = allItemsCache[selectedCacheIndex];
            
            if (itemData.type === 'toggler') {
                itemData.isExpanded = !itemData.isExpanded;
                itemData.text = itemData.indent + (itemData.isExpanded ? "--------------------------------" : "-+----------------------------+-");
            } else {
                itemData.isActive = !itemData.isActive;
                
                if (itemData.type === 'comp') {
                    var newStatus = itemData.isActive;
                    var parentCompId = itemData.ae_id;

                    for (var i = 0; i < allItemsCache.length; i++) {
                        var childItem = allItemsCache[i];
                        if (childItem.cacheID === selectedCacheIndex) continue;

                        var isDescendant = false;
                        var tempParentID = childItem.parentCacheID;
                        while (tempParentID !== -1) {
                            var ancestorToggler = allItemsCache[tempParentID];
                            if (ancestorToggler.ae_id === parentCompId) {
                                isDescendant = true;
                                break;
                            }
                            tempParentID = ancestorToggler.parentCacheID;
                        }

                        if (isDescendant) {
                            childItem.isActive = newStatus;
                        }
                    }
                }
            }

            renderList(getNewDurationStr());
            this.selection = null;
        };

        durationInput.onChanging = updateUI;
        frameInput.onChanging = updateUI;
        fpsInput.onChanging = updateUI;
        updateUI();

        // --- PANEL TÙY CHỌN ---
        var optionsPanel = dialog.add("panel", undefined, "Tùy chọn");
        optionsPanel.orientation = "column"; 
        optionsPanel.alignment = ["fill", "top"];
        optionsPanel.alignChildren = ["left", "top"];

        var extendEndTouchingCheckbox = optionsPanel.add("checkbox", undefined, "Chỉ dãn layer chạm đuôi timeline (an toàn)");
        extendEndTouchingCheckbox.value = true;
        extendEndTouchingCheckbox.helpTip = "Nếu được chọn, script sẽ chỉ kéo dài các layer có outPoint (điểm kết thúc) bằng với duration của comp cha.";

        // --- TÙY CHỌN BACKUP ---
        var backupCheckbox = optionsPanel.add("checkbox", undefined, "Backup mỗi khi thực thi");
        backupCheckbox.value = true;

        var backupPathText;
        if (app.project.file) { 
            var fullBackupPath = Folder.decode(app.project.file.path + "/DurationEdit_backup/");
            
            var pathComponents = fullBackupPath.split('/');
            // Loại bỏ phần tử rỗng ở cuối nếu có
            if (pathComponents[pathComponents.length - 1] == "") {
                pathComponents.pop();
            }

            var displayPath;
            if (pathComponents.length > 5) {
                displayPath = ".../" + pathComponents.slice(-5).join('/');
            } else {
                displayPath = fullBackupPath;
            }

            backupPathText = optionsPanel.add("statictext", undefined, "Lưu tại: " + displayPath);
            backupPathText.helpTip = "Đường dẫn đầy đủ: " + fullBackupPath;
            backupPathText.enabled = false;
        } else {
            backupCheckbox.value = false;
            backupCheckbox.enabled = false;
            backupPathText = optionsPanel.add("statictext", undefined, "Lưu project để bật tính năng backup.");
            backupPathText.enabled = false;
        }

        // --- BUTTONS ---
        var buttonGroup = dialog.add("group");
        buttonGroup.orientation = "row";
        buttonGroup.alignment = ["right", "top"];
        buttonGroup.add("button", undefined, "OK", { name: "ok" });
        buttonGroup.add("button", undefined, "Hủy", { name: "cancel" });

        if (dialog.show() === 1) {
            updateUI();
            
            var activeItems = {};
            for(var i = 0; i < allItemsCache.length; i++) {
                var itemData = allItemsCache[i];
                if(itemData.isActive && (itemData.type === 'comp' || itemData.type === 'layer')) {
                   activeItems[itemData.ae_id] = true;
                }
            }

            return {
                duration: parseFloat(durationInput.text),
                frames: parseInt(frameInput.text),
                fps: parseFloat(fpsInput.text),
                activeItems: activeItems,
                onlyExtendEndTouching: extendEndTouchingCheckbox.value,
                doBackup: backupCheckbox.value && backupCheckbox.enabled
            };
        } else {
            return null;
        }
    }
    
    // --- FUNCTION ĐỂ BACKUP PROJECT ---
    function createBackup() {
        if (!app.project.file) {
            return false; 
        }

        var projectFile = app.project.file;
        var projectPath = projectFile.path;
        var projectName = projectFile.name.replace(/\.aep$/i, "");

        var backupFolderPath = projectPath + "/DurationEdit_backup";
        var backupFolder = new Folder(backupFolderPath);

        if (!backupFolder.exists) {
            var success = backupFolder.create();
            if (!success) {
                alert("Không thể tạo thư mục backup tại:\n" + Folder.decode(backupFolderPath));
                return false;
            }
        }

        var backupIndex = 1;
        var backupFile;
        do {
            var backupFileName = projectName + "_BK_" + backupIndex + ".aep";
            backupFile = new File(backupFolder.fsName + "/" + backupFileName);
            backupIndex++;
        } while (backupFile.exists);

        try {
            app.project.save(backupFile);
            return true;
        } catch (e) {
            alert("Đã xảy ra lỗi khi tạo file backup:\n" + e.toString());
            return false;
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

    var userInput = createDialog(masterComp);
    if (userInput === null) {
        return;
    }
    
    if (userInput.doBackup) {
        var backupSuccess = createBackup();
        if (!backupSuccess) {
            return; 
        }
    }

    var newDurationSecs = userInput.duration;
    var newFrames = userInput.frames;
    var newFps = userInput.fps;
    var activeItems = userInput.activeItems;
    var onlyExtendEndTouching = userInput.onlyExtendEndTouching; 

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
    var processedCount = 0;

    for (var i = 0; i < compsToProcess.length; i++) {
        var currentComp = compsToProcess[i];
        var compWasModified = false;
        var originalCompDuration = currentComp.duration; 

        if (activeItems[currentComp.id]) {
            currentComp.duration = newDuration;
            currentComp.frameRate = newFps;
            compWasModified = true;
        }

        for (var j = 1; j <= currentComp.numLayers; j++) {
            var currentLayer = currentComp.layer(j);
            if (activeItems[currentLayer.id] && canLayerBeExtended(currentLayer)) {
                
                var touchesTimelineEnd = (Math.abs(currentLayer.outPoint - originalCompDuration) < 0.001);

                if (!onlyExtendEndTouching || (onlyExtendEndTouching && touchesTimelineEnd)) {
                    currentLayer.outPoint = newDuration;
                    if(!compWasModified) {
                        compWasModified = true;
                    }
                }
            }
        }

        if(compWasModified) {
            processedCount++;
        }
    }

    alert("Hoàn tất!\nĐã xử lý thành công " + processedCount + " compositions/items, bắt đầu từ '" + masterComp.name + "'.");

    app.endUndoGroup();

})();