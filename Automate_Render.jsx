#target photoshop
app.bringToFront();

(function () {
    var templateFile = new File(File($.fileName).parent.fsName + "/NewTest/SFH_PSD_Template.psd");
    if (!templateFile.exists) {
        alert("The template PSD must be in the NewTest folder beside this script.");
        return;
    }

    var renderFile = File.openDialog("Select the new 3ds Max EXR render", "EXR:*.exr");
    if (!renderFile) return;
    if (!/\.exr$/i.test(renderFile.name)) {
        alert("Please select an EXR render.");
        return;
    }

    var maskNames = ["House", "BG Trees"];
    var maskOutputFolder = new Folder(renderFile.parent.fsName + "/" + renderFile.name.replace(/\.exr$/i, "") + "_Photoshop_Masks");
    var maskFiles = [];
    for (var fileIndex = 0; fileIndex < maskNames.length; fileIndex++) {
        maskFiles.push(new File(maskOutputFolder.fsName + "/" + maskNames[fileIndex] + ".png"));
    }
    maskFiles.push(new File(maskOutputFolder.fsName + "/Alpha_Sky.png"));
    if (!allMaskFilesExist(maskFiles)) {
        try {
            prepareMasksForRender(renderFile, maskOutputFolder);
        } catch (maskError) {
            alert("Could not prepare masks for the selected render:\n" + maskError.message);
            return;
        }
    }
    if (!allMaskFilesExist(maskFiles)) {
        alert("Mask preparation finished, but one or more required masks are missing:\n" + maskOutputFolder.fsName);
        return;
    }

    var outputFolder = Folder.selectDialog("Choose a folder for the processed PSD");
    if (!outputFolder) return;

    var previousDialogs = app.displayDialogs;
    var maskDoc = null;
    var outputDoc = null;
    var completed = false;
    var currentStage = "Starting";

    try {
        app.displayDialogs = DialogModes.NO;

        currentStage = "Opening the template PSD";
        outputDoc = app.open(templateFile);

        var renderLayerName = decodeURI(renderFile.name.replace(/\.exr$/i, ""));
        var baseRenderLayer = findUniqueLayer(outputDoc, "Beauty Pass");
        if (baseRenderLayer.typename !== "ArtLayer" || baseRenderLayer.kind !== LayerKind.NORMAL) {
            throw new Error("The template's original base render layer was not found or is not a pixel layer.");
        }
        outputDoc.activeLayer = baseRenderLayer;
        currentStage = "Converting the original base render to a replaceable smart object";
        executeAction(stringIDToTypeID("newPlacedLayer"), undefined, DialogModes.NO);
        baseRenderLayer = outputDoc.activeLayer;
        if (baseRenderLayer.typename !== "ArtLayer" || baseRenderLayer.kind !== LayerKind.SMARTOBJECT) {
            throw new Error("Photoshop could not convert the original base render to a smart object.");
        }

        currentStage = "Replacing the original base render with the selected EXR";
        var baseReplaceDesc = new ActionDescriptor();
        baseReplaceDesc.putPath(charIDToTypeID("null"), renderFile);
        executeAction(stringIDToTypeID("placedLayerReplaceContents"), baseReplaceDesc, DialogModes.NO);
        baseRenderLayer.name = renderLayerName;

        var renderLayer = findUniqueLayer(outputDoc, "Copy of Beauty Pass - Convert To Smart Object - CameraRAW");
        if (renderLayer.typename !== "ArtLayer" || renderLayer.kind !== LayerKind.SMARTOBJECT) {
            throw new Error("The template's Camera Raw smart-object layer was not found or is not a smart object.");
        }

        outputDoc.activeLayer = renderLayer;
        currentStage = "Replacing the template render with the selected EXR";
        var replaceDesc = new ActionDescriptor();
        replaceDesc.putPath(charIDToTypeID("null"), renderFile);
        executeAction(stringIDToTypeID("placedLayerReplaceContents"), replaceDesc, DialogModes.NO);
        renderLayer.name = renderLayerName;

        var localGroup = findUniqueLayer(outputDoc, "Local");
        var mmGroup = findUniqueLayer(outputDoc, "MM");
        var alphaLayer = findUniqueLayerIn(mmGroup, "Alpha_Sky");
        var curveLayer = findUniqueLayerIn(mmGroup, "Curves 9");
        var mergedSkyLayer = findUniqueLayerIn(mmGroup, "Sky_Invert");
        if (alphaLayer.typename !== "ArtLayer" || alphaLayer.kind !== LayerKind.NORMAL ||
            mergedSkyLayer.typename !== "ArtLayer" || mergedSkyLayer.kind !== LayerKind.NORMAL ||
            curveLayer.typename !== "ArtLayer") {
            throw new Error("The template's MM Alpha_Sky, Curves 9, or Sky_Invert layer has an unexpected type.");
        }
        var targetGroups = [
            findUniqueLayerIn(localGroup, "House"),
            findUniqueLayerIn(localGroup, "BG Trees")
        ];
        var skyTargetGroup = findUniqueLayerIn(localGroup, "Sky_Invert");

        for (var i = 0; i < maskNames.length; i++) {
            currentStage = "Opening the generated " + maskNames[i] + " mask";
            maskDoc = app.open(maskFiles[i]);
            assertSameCanvas(maskDoc, outputDoc);
            currentStage = "Applying the " + maskNames[i] + " mask";
            replaceMaskOnLayer(maskDoc, outputDoc, targetGroups[i]);
            maskDoc.close(SaveOptions.DONOTSAVECHANGES);
            maskDoc = null;
        }

        currentStage = "Opening the selected render's Alpha_Sky mask";
        maskDoc = app.open(maskFiles[2]);
        assertSameCanvas(maskDoc, outputDoc);
        currentStage = "Updating MM/Alpha_Sky from the selected render";
        app.activeDocument = maskDoc;
        maskDoc.selection.selectAll();
        maskDoc.selection.copy();
        app.activeDocument = outputDoc;
        outputDoc.activeLayer = alphaLayer;
        outputDoc.paste();
        var replacementAlpha = outputDoc.activeLayer;
        replacementAlpha.move(alphaLayer, ElementPlacement.PLACEBEFORE);
        replacementAlpha.name = "Alpha_Sky";
        replacementAlpha.visible = alphaLayer.visible;
        alphaLayer.remove();
        maskDoc.close(SaveOptions.DONOTSAVECHANGES);
        maskDoc = null;

        currentStage = "Merging MM/Alpha_Sky with MM/Curves 9";
        var rootVisibility = [];
        for (var rootIndex = 0; rootIndex < outputDoc.layers.length; rootIndex++) {
            rootVisibility.push(outputDoc.layers[rootIndex].visible);
            outputDoc.layers[rootIndex].visible = false;
        }
        var alphaVisibility = replacementAlpha.visible;
        var skyVisibility = mergedSkyLayer.visible;
        var mmVisibility = [];
        for (var mmIndex = 0; mmIndex < mmGroup.layers.length; mmIndex++) {
            mmVisibility.push({
                layer: mmGroup.layers[mmIndex],
                visible: mmGroup.layers[mmIndex].visible
            });
            mmGroup.layers[mmIndex].visible = false;
        }
        mmGroup.visible = true;
        replacementAlpha.visible = true;
        curveLayer.visible = true;
        app.activeDocument = outputDoc;
        outputDoc.selection.selectAll();
        outputDoc.selection.copy(true);
        outputDoc.selection.deselect();
        outputDoc.paste();
        var updatedSkyLayer = outputDoc.activeLayer;
        updatedSkyLayer.move(mergedSkyLayer, ElementPlacement.PLACEBEFORE);
        updatedSkyLayer.name = "Sky_Invert";
        updatedSkyLayer.visible = false;
        for (var restoreRoot = 0; restoreRoot < outputDoc.layers.length; restoreRoot++) {
            outputDoc.layers[restoreRoot].visible = rootVisibility[restoreRoot];
        }
        for (var restoreMM = 0; restoreMM < mmVisibility.length; restoreMM++) {
            var savedLayer = mmVisibility[restoreMM];
            savedLayer.layer.visible = savedLayer.visible;
        }
        replacementAlpha.visible = alphaVisibility;
        mergedSkyLayer.remove();
        updatedSkyLayer.visible = skyVisibility;

        currentStage = "Creating a mask document from the updated MM/Sky_Invert layer";
        app.activeDocument = outputDoc;
        updatedSkyLayer.visible = true;
        outputDoc.activeLayer = updatedSkyLayer;
        outputDoc.selection.selectAll();
        outputDoc.selection.copy();
        outputDoc.selection.deselect();
        updatedSkyLayer.visible = skyVisibility;
        maskDoc = app.documents.add(
            outputDoc.width,
            outputDoc.height,
            outputDoc.resolution,
            "Sky_Invert Mask",
            NewDocumentMode.RGB,
            DocumentFill.WHITE
        );
        app.activeDocument = maskDoc;
        maskDoc.paste();
        maskDoc.flatten();
        assertSameCanvas(maskDoc, outputDoc);
        currentStage = "Applying the updated MM/Sky_Invert mask";
        replaceMaskOnLayer(maskDoc, outputDoc, skyTargetGroup);
        maskDoc.close(SaveOptions.DONOTSAVECHANGES);
        maskDoc = null;

        var baseName = renderFile.name.replace(/\.exr$/i, "");
        var outputFile = nextAvailableFile(outputFolder, baseName + "_Edited", ".psd");
        var saveOptions = new PhotoshopSaveOptions();
        saveOptions.layers = true;
        saveOptions.embedColorProfile = true;
        currentStage = "Saving the processed PSD";
        outputDoc.saveAs(outputFile, saveOptions, false, Extension.LOWERCASE);

        completed = true;
        alert("Finished. Saved the layered result to:\n" + outputFile.fsName);
    } catch (error) {
        var errorDetails = "Automation stopped during: " + currentStage + "\n" + error.message;
        if (error.number !== undefined) errorDetails += "\nPhotoshop error code: " + error.number;
        if (error.line !== undefined) errorDetails += "\nScript line: " + error.line;
        alert(errorDetails);
    } finally {
        if (maskDoc) maskDoc.close(SaveOptions.DONOTSAVECHANGES);
        if (outputDoc && !completed) outputDoc.close(SaveOptions.DONOTSAVECHANGES);
        app.displayDialogs = previousDialogs;
    }

    function assertSameCanvas(sourceDoc, targetDoc) {
        if (Math.round(sourceDoc.width.as("px")) !== Math.round(targetDoc.width.as("px")) ||
            Math.round(sourceDoc.height.as("px")) !== Math.round(targetDoc.height.as("px"))) {
            throw new Error("A generated mask and the template have different canvas dimensions.");
        }
    }

    function allMaskFilesExist(files) {
        for (var i = 0; i < files.length; i++) {
            if (!files[i].exists) return false;
        }
        return true;
    }

    function prepareMasksForRender(selectedRender, outputFolder) {
        var scriptFolder = File($.fileName).parent;
        var localAppData = $.getenv("LOCALAPPDATA");
        if (!localAppData) {
            throw new Error("Windows LOCALAPPDATA is not available for this user.");
        }
        var pythonFile = new File(localAppData + "/Photoshop_Edit/.venv/Scripts/python.exe");
        var maskScript = new File(scriptFolder.fsName + "/Prepare_Render_Masks.py");
        if (!pythonFile.exists || !maskScript.exists) {
            throw new Error("The user's Python environment or Prepare_Render_Masks.py was not found. Complete the per-user setup in README.md first.");
        }

        var jobId = "PhotoshopMaskJob_" + (new Date().getTime()) + "_" + Math.floor(Math.random() * 1000000);
        var requestFile = new File(Folder.temp.fsName + "/" + jobId + ".txt");
        var batchFile = new File(Folder.temp.fsName + "/" + jobId + ".bat");
        var statusFile = new File(Folder.temp.fsName + "/" + jobId + ".status");
        var logFile = new File(Folder.temp.fsName + "/" + jobId + ".log");
        var requestWritten = false;
        var batchWritten = false;
        var batchStarted = false;

        try {
            requestFile.encoding = "UTF-8";
            requestFile.lineFeed = "Windows";
            if (!requestFile.open("w")) throw new Error("Could not create a temporary mask request file.");
            requestFile.write(selectedRender.fsName + "\r\n" + outputFolder.fsName + "\r\n");
            requestFile.close();
            requestWritten = true;

            batchFile.encoding = "UTF-8";
            batchFile.lineFeed = "Windows";
            if (!batchFile.open("w")) throw new Error("Could not create a temporary mask preparation command.");
            batchFile.writeln("@echo off");
            batchFile.writeln("setlocal");
            batchFile.writeln("set PYTHONIOENCODING=utf-8");
            batchFile.writeln(
                quoteBatchPath(pythonFile.fsName) + " " +
                quoteBatchPath(maskScript.fsName) + " --request-file " +
                quoteBatchPath(requestFile.fsName) + " > " +
                quoteBatchPath(logFile.fsName) + " 2>&1"
            );
            batchFile.writeln('set "jobExitCode=%ERRORLEVEL%"');
            batchFile.writeln("> " + quoteBatchPath(statusFile.fsName) + " echo %jobExitCode%");
            batchFile.close();
            batchWritten = true;

            if (!batchFile.execute()) throw new Error("Windows could not start mask preparation.");
            batchStarted = true;

            var deadline = new Date().getTime() + 600000;
            while (!statusFile.exists && new Date().getTime() < deadline) {
                $.sleep(250);
            }
            if (!statusFile.exists) {
                throw new Error("Mask preparation did not finish within 10 minutes. The process may still be running.");
            }

            batchStarted = false;
            statusFile.encoding = "UTF-8";
            if (!statusFile.open("r")) throw new Error("Could not read the mask preparation result.");
            var exitCode = statusFile.read().replace(/^\s+|\s+$/g, "");
            statusFile.close();
            if (exitCode !== "0") {
                var details = "";
                if (logFile.exists && logFile.open("r")) {
                    logFile.encoding = "UTF-8";
                    details = logFile.read();
                    logFile.close();
                }
                throw new Error("Mask preparation failed." + (details ? "\n" + details : ""));
            }
        } finally {
            if (!batchStarted || statusFile.exists) {
                if (requestWritten) requestFile.remove();
                if (batchWritten) batchFile.remove();
                if (statusFile.exists) statusFile.remove();
                if (logFile.exists) logFile.remove();
            }
        }
    }

    function quoteBatchPath(path) {
        return '"' + path.replace(/%/g, "%%") + '"';
    }

    function findUniqueLayer(container, name) {
        var found = [];
        collectNamedLayers(container.layers, name.toLowerCase(), found);
        if (found.length !== 1) {
            throw new Error("Expected one layer named '" + name + "', found " + found.length + ".");
        }
        return found[0];
    }

    function findUniqueLayerIn(container, name) {
        var found = [];
        collectNamedLayers(container.layers, name.toLowerCase(), found);
        if (found.length !== 1) {
            throw new Error("Expected one '" + name + "' layer inside '" + container.name + "', found " + found.length + ".");
        }
        return found[0];
    }

    function collectNamedLayers(layers, wantedName, found) {
        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];
            if (layer.name.toLowerCase() === wantedName) found.push(layer);
            if (layer.typename === "LayerSet") collectNamedLayers(layer.layers, wantedName, found);
        }
    }

    function replaceMaskOnLayer(sourceDoc, targetDoc, targetLayer) {
        currentStage = "Loading the " + targetLayer.name + " mask channel";
        var sourceChannel = sourceDoc.channels[0];
        var targetChannel = sourceChannel.duplicate(targetDoc);
        applySelectionAsMask(targetDoc, targetChannel, targetLayer);
        targetDoc.selection.deselect();
        targetChannel.remove();
        targetDoc.activeChannels = targetDoc.componentChannels;
    }

    function applySelectionAsMask(targetDoc, maskChannel, targetLayer) {
        app.activeDocument = targetDoc;
        currentStage = "Loading mask selection for " + targetLayer.name;
        targetDoc.selection.load(maskChannel, SelectionType.REPLACE);
        assertActiveSelection(targetDoc, targetLayer.name);
        targetDoc.activeLayer = targetLayer;
        if (hasUserMask(targetLayer.id)) {
            currentStage = "Removing the old " + targetLayer.name + " layer mask";
            deleteLayerMask();
            if (hasUserMask(targetLayer.id)) {
                throw new Error("Photoshop did not remove the existing " + targetLayer.name + " mask.");
            }
        }
        assertActiveSelection(targetDoc, targetLayer.name);
        currentStage = "Preparing Photoshop channels for the " + targetLayer.name + " mask";
        targetDoc.activeChannels = targetDoc.componentChannels;
        targetDoc.activeLayer = targetLayer;
        currentStage = "Creating the " + targetLayer.name + " layer mask from its selection";
        addRevealSelectionMask();
    }

    function assertActiveSelection(targetDoc, layerName) {
        var bounds;
        try {
            bounds = targetDoc.selection.bounds;
        } catch (selectionError) {
            throw new Error("Photoshop has no active selection for the " + layerName + " mask.");
        }
        if (!bounds || bounds.length !== 4 || bounds[2].as("px") <= bounds[0].as("px") || bounds[3].as("px") <= bounds[1].as("px")) {
            throw new Error("The generated " + layerName + " mask contains no selected pixels.");
        }
    }

    function hasUserMask(layerId) {
        var ref = new ActionReference();
        ref.putIdentifier(charIDToTypeID("Lyr "), layerId);
        var desc = executeActionGet(ref);
        var key = stringIDToTypeID("hasUserMask");
        return desc.hasKey(key) && desc.getBoolean(key);
    }

    function deleteLayerMask() {
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
        desc.putReference(charIDToTypeID("null"), ref);
        desc.putBoolean(charIDToTypeID("Aply"), false);
        executeAction(charIDToTypeID("Dlt "), desc, DialogModes.NO);
    }

    function addRevealSelectionMask() {
        var desc = new ActionDescriptor();
        desc.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
        var atRef = new ActionReference();
        atRef.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
        desc.putReference(charIDToTypeID("At  "), atRef);
        desc.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
        executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
    }

    function nextAvailableFile(folder, baseName, extension) {
        var candidate = new File(folder.fsName + "/" + baseName + extension);
        var index = 2;
        while (candidate.exists) {
            candidate = new File(folder.fsName + "/" + baseName + "_" + index + extension);
            index++;
        }
        return candidate;
    }
}());
