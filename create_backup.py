import os
import zipfile
import datetime

def backup_project():
    # Use the current working directory as the root
    root_dir = os.getcwd()
    backup_dir = os.path.join(root_dir, 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    
    timestamp = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    zip_filename = f"ProjectBackup_{timestamp}.zip"
    zip_path = os.path.join(backup_dir, zip_filename)
    
    exclusions = {'node_modules', '__pycache__', '.git', 'backups', 'dist', 'build', '.gemini', 'venv'} 
    
    print(f"Creating backup at {zip_path}...")
    count = 0
    
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(root_dir):
            # Modify dirs in-place to skip excluded directories
            # This prevents walking into them
            dirs[:] = [d for d in dirs if d not in exclusions]
            
            for file in files:
                # Extra safety check for file extensions or names
                if file.endswith('.zip') or file.endswith('.lock'):
                    continue
                
                file_path = os.path.join(root, file)
                arcname = os.path.relpath(file_path, root_dir)
                
                # Safety check against backing up the backup folder itself if it wasn't caught by dirs exclusion
                if arcname.startswith('backups') or 'node_modules' in arcname:
                    continue
                
                try:
                    zipf.write(file_path, arcname)
                    count += 1
                except Exception as e:
                    print(f"Failed to zip {arcname}: {e}")

    print(f"Backup complete. {count} files archived.")
    print(f"File saved to: {zip_path}")

if __name__ == "__main__":
    backup_project()
