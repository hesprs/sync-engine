# Migrate Your Cloud Storage

Some features, like [Asymmetric Storage](../deep-dive/asymmetric-storage) and [Encryption](../deep-dive/modules/encryption), require your remote storage be in a different format. When you toggle those features but the remote is still in an incompatible format, Sync Engine could produce catastrophic sync results.

Sync Engine itself does not try to migrate the remote format automatically. This is because sync strategies may differ across devices, and a Sync Engine installation on one device cannot reliably perform a migration without leaving the remote or other devices in a broken partial state. This might be improved in the future, but a manual migration is currently necessary when you toggle those features.

This page elaborates how to safely perform a manual migration with Sync Engine.

## Steps

1. Perform synchronizations on all your devices to ensure that they all have the latest set of files.
2. Choose one of your devices that has the most files and best network as your primary operating device, exit Obsidian on other devices.
3. Temporarily turn off realtime and scheduled syncing on that device to prevent accidental interference.
4. Adjust [sync strategies](./settings#sync-strategy) temporarily and perform syncs to ensure that the vault on this device has the **complete set of files** you need to upload to remote. When done, finally adjust sync strategies to ensure that **"Mirror local" strategy is applied to this whole set of files**.
5. **Find [Clear records](./settings#clear-records) in development settings and click "Clear"**.
6. Copy the entire set of files to a different place as backup.
7. Go to the file management interface of your cloud storage, **manually delete all previously synchronized files, or remove the base directory directly**.
8. Toggle the feature that changes the remote format (like encryption or asymmetric storage), a migration pop-up reminder should be shown, click "Confirm".
9. Now trigger a manual sync, a preview full of upload operations should be shown. Review the files to upload and start syncing, wait for the mass upload to complete.
10. **Turn off all network connections on other devices and enter Obsidian on each device**, toggle the same feature that you want to migrate for.
11. Restore network connections on these devices, and start a manual trial sync each. The sync should complete as already synchronized with no additional operations to perform.
12. Restore sync strategies and realtime / scheduled sync settings on your primary device. Then the migration is complete.
