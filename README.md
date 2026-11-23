# Photoshop Render Automation

Automates the Photoshop finishing steps for a 3ds Max EXR render using the adjustment values in `NewTest/SFH_PSD_Template.psd`.

## Requirements

- Adobe Photoshop
- Python 3.10 or newer
- The render-element EXRs beside the beauty render EXR

## Setup

Each user needs Python 3.10 or newer on their computer. The scripts and template can stay on a shared server, but each user must create their own Python environment locally. In PowerShell, replace the example server path below with the shared folder path, then run:

```powershell
$envPath = Join-Path $env:LOCALAPPDATA "Photoshop_Edit\.venv"
py -3 -m venv $envPath
& "$envPath\Scripts\python.exe" -m pip install -r "\\ServerName\Shared\Photoshop_Edit\requirements.txt"
```

This creates the environment under the user's Windows profile. Keep the shared folder structure intact, including `NewTest\SFH_PSD_Template.psd`. Users need read access to the scripts/template and write access to the render and output folders.

## Run

1. In Photoshop, choose **File > Scripts > Browse** and open `Automate_Render.jsx`.
2. Select the beauty render EXR and choose an output folder. If masks have not already been generated for that render, the script prepares them automatically in a `<render-name>_Photoshop_Masks` folder beside it.

The beauty render and its matching render elements must be in the same folder and share the same render-name stem. The mask generator accepts these equivalent pass names:

- House: `<render-name>_CMasking_Mask_House.exr` or `<render-name>_House.exr`
- BG Trees: `<render-name>_CMasking_Mask_Background_Tree_Scatter.exr`, `<render-name>_Background_Tree_Scatter.exr`, or the existing `Background_Trees` variants
- Sky input: `<render-name>_CShading_Alpha.exr`, `<render-name>_CShading_Alpha_Sky.exr`, or `<render-name>_Alpha_Sky.exr`

The Sky input pass updates `MM/Alpha_Sky` in the template. The automation applies `MM/Curves 9`, creates an updated merged `MM/Sky_Invert` layer, and applies that mask to the `Adjustments/Local/Sky_Invert` group. House, BG Trees, and Sky_Invert masks are applied only to their corresponding groups, preserving each adjustment layer's own mask inside those groups. `Prepare_Render_Masks.bat` remains available for generating these masks separately. The output is a new layered PSD; the automation does not overwrite the template.
