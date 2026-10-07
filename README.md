# Photoshop Render Automation

Automates the Photoshop finishing steps for a 3ds Max EXR render using the adjustment values in `INL_SFD_Photoshop_Template.psd`.

## Requirements

- Adobe Photoshop
- Python 3.10 or newer
- The render-element EXRs beside the beauty render EXR

## Setup

From this folder, create a virtual environment and install the dependencies:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Keep the local template file `INL_SFD_Photoshop_Template.psd` in this folder. It is intentionally excluded from Git because Photoshop PSDs can be very large and may contain project-specific content.

## Run

1. In Photoshop, choose **File > Scripts > Browse** and open `Automate_Render.jsx`.
2. Select the beauty render EXR and choose an output folder. If masks have not already been generated for that render, the script prepares them automatically in a `<render-name>_Photoshop_Masks` folder beside it.

The render-element EXRs and alpha pass must be beside the beauty render. `Prepare_Render_Masks.bat` remains available for generating masks separately. The output is a new layered PSD; the automation does not overwrite the template.
