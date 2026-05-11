import os
import sys
import numpy as np
from PIL import Image

def remove_green_background(input_path, output_path):
    try:
        img = Image.open(input_path).convert("RGBA")
        data = np.array(img)
        
        # Extract RGBA channels
        r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
        
        # Chroma key condition: Green is much stronger than Red and Blue
        # Bright green #00FF00 typically has G>200, R<50, B<50
        mask = (g > 150) & (r < 100) & (b < 100)
        
        # Set alpha to 0 for the green background pixels
        data[mask, 3] = 0
        
        # Handle edges (anti-aliasing green halo) by finding pixels with prominent green
        # and reducing their green channel & alpha
        edge_mask = (g > 100) & (g > r + 30) & (g > b + 30) & (~mask)
        data[edge_mask, 1] = np.minimum(data[edge_mask, 1], np.maximum(data[edge_mask, 0], data[edge_mask, 2]))
        data[edge_mask, 3] = np.clip(data[edge_mask, 3] * 0.5, 0, 255).astype(np.uint8)

        out_img = Image.fromarray(data)
        out_img.save(output_path, "PNG")
        print(f"Processed: {input_path}")
    except Exception as e:
        print(f"Failed to process {input_path}: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python remove_green_bg.py <directory_or_file>")
        sys.exit(1)
        
    target = sys.argv[1]
    
    if os.path.isfile(target):
        remove_green_background(target, target)
    elif os.path.isdir(target):
        for root, dirs, files in os.walk(target):
            for file in files:
                if file.endswith(".png"):
                    path = os.path.join(root, file)
                    remove_green_background(path, path)
