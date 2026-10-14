Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
if ($args.Count -gt 0 -and $args[0]) {
    $dialog.Description = $args[0]
} else {
    $dialog.Description = "Select Folder"
}
$dialog.ShowNewFolderButton = $true
if ($args.Count -gt 1 -and $args[1] -and (Test-Path $args[1])) {
    $dialog.SelectedPath = $args[1]
}

$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$form.WindowState = [System.Windows.Forms.FormWindowState]::Minimized
$form.Show()
$form.Activate()

$res = $dialog.ShowDialog($form)
if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    Write-Output $dialog.SelectedPath
}

$form.Close()
$form.Dispose()
$dialog.Dispose()
