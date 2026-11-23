from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import OpenEXR
from PIL import Image


def read_rgba(path: Path, expected_shape: tuple[int, int] | None = None) -> np.ndarray:
    if not path.is_file():
        raise FileNotFoundError(f"Required render element not found: {path.name}")

    channels = OpenEXR.File(str(path)).channels()
    if "RGBA" not in channels:
        raise ValueError(f"Expected an RGBA channel in {path.name}; found {list(channels)}")

    pixels = channels["RGBA"].pixels.astype(np.float32)
    if expected_shape is not None and pixels.shape[:2] != expected_shape:
        raise ValueError(
            f"{path.name} is {pixels.shape[1]}x{pixels.shape[0]}, "
            f"but the render is {expected_shape[1]}x{expected_shape[0]}"
        )
    return pixels


def save_mask(path: Path, values: np.ndarray) -> None:
    pixels = np.rint(np.clip(values, 0.0, 1.0) * 65535.0).astype(np.uint16)
    Image.fromarray(pixels).save(path)


def prepare_masks(render_path: Path, output_folder: Path) -> None:
    stem = render_path.stem
    render = read_rgba(render_path)
    image_shape = render.shape[:2]

    def render_element(*suffixes: str) -> np.ndarray:
        candidates = [render_path.with_name(f"{stem}_{suffix}.exr") for suffix in suffixes]
        path = next((candidate for candidate in candidates if candidate.is_file()), None)
        if path is None:
            expected = ", ".join(candidate.name for candidate in candidates)
            raise FileNotFoundError(f"Required render element not found. Expected one of: {expected}")
        return read_rgba(path, image_shape)

    house = render_element("CMasking_Mask_House", "House")
    background_trees = render_element(
        "CMasking_Mask_Background_Tree_Scatter",
        "Background_Tree_Scatter",
        "CMasking_Mask_Background_Trees",
        "Background_Trees",
    )
    alpha_sky = render_element("CShading_Alpha", "CShading_Alpha_Sky", "Alpha_Sky")
    masks = {
        "House": house[:, :, 0],
        "BG Trees": background_trees[:, :, 0],
        "Alpha_Sky": alpha_sky[:, :, 0],
    }

    output_folder.mkdir(parents=True, exist_ok=True)
    for name, values in masks.items():
        save_mask(output_folder / f"{name}.png", values)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Photoshop masks from 3ds Max EXR render elements.")
    parser.add_argument("render", nargs="?", type=Path, help="Beauty render EXR")
    parser.add_argument("output_folder", nargs="?", type=Path, help="Folder for generated grayscale masks")
    parser.add_argument(
        "--request-file",
        type=Path,
        help="UTF-8 text file containing the render path and output folder on separate lines",
    )
    args = parser.parse_args()

    root = None
    if args.request_file is not None:
        if args.render is not None or args.output_folder is not None:
            parser.error("--request-file cannot be combined with positional paths")
        try:
            request_lines = args.request_file.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError) as error:
            print(f"Could not read mask preparation request:\n{error}")
            return 1
        if len(request_lines) != 2 or not all(request_lines):
            print("Mask preparation request must contain a render path and an output folder.")
            return 1
        render_path = Path(request_lines[0].lstrip("\ufeff"))
        requested_output_folder = Path(request_lines[1])
    else:
        render_path = args.render
        requested_output_folder = args.output_folder

    if render_path is None:
        import tkinter as tk
        from tkinter import filedialog

        root = tk.Tk()
        root.withdraw()
        selected = filedialog.askopenfilename(
            title="Select the 3ds Max beauty render EXR",
            filetypes=[("OpenEXR render", "*.exr")],
        )
        if not selected:
            root.destroy()
            return 0
        render_path = Path(selected)

    output_folder = requested_output_folder or render_path.with_name(f"{render_path.stem}_Photoshop_Masks")
    try:
        prepare_masks(render_path, output_folder)
    except Exception as error:
        message = f"Mask preparation failed:\n{error}"
        print(message)
        if root is not None:
            from tkinter import messagebox

            messagebox.showerror("Photoshop Mask Preparation", message, parent=root)
            root.destroy()
        return 1

    message = f"Prepared masks in:\n{output_folder}"
    print(message)
    if root is not None:
        from tkinter import messagebox

        messagebox.showinfo("Photoshop Mask Preparation", message, parent=root)
        root.destroy()
    return 0


if __name__ == "__main__":
    sys.exit(main())
