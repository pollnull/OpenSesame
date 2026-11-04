package com.opensesame.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

// Hands the .sesame file being shared to the app the person picks, read-only, through a temporary
// content:// link. Only files inside cache/shared can be reached (the app has no androidx FileProvider).
public class ShareProvider extends ContentProvider {
    static File folder(File cacheDir) {
        return new File(cacheDir, "shared");
    }

    private File fileFor(Uri uri) throws FileNotFoundException {
        String name = uri.getLastPathSegment();
        File folder = folder(getContext().getCacheDir());
        File file = new File(folder, name == null ? "" : name);
        try {
            if (!file.getCanonicalFile().getParentFile().equals(folder.getCanonicalFile()) || !file.isFile()) throw new FileNotFoundException();
        } catch (IOException error) {
            throw new FileNotFoundException();
        }
        return file;
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    // Receiving apps ask for the name and size to show the attachment.
    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        File file;
        try {
            file = fileFor(uri);
        } catch (FileNotFoundException error) {
            return null;
        }
        MatrixCursor cursor = new MatrixCursor(new String[] { OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE });
        cursor.addRow(new Object[] { file.getName(), file.length() });
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        return "application/octet-stream";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        return 0;
    }
}
