# ADB tới gauguin từ VM Linux (2026-11-12)

## Cách chọn: SSH reverse tunnel từ Windows

- Windows mở `ssh -R 127.0.0.1:5038:127.0.0.1:5037` tới VM (qua jump host Proxmox).
- adb server Windows vẫn chỉ nghe `127.0.0.1:5037`, không lộ ra LAN/tailnet; tunnel đi trong SSH (đã xác thực bằng key).
- Trên VM, cổng 5038 chỉ bind `127.0.0.1`. Dùng 5038 thay cho 5037 để một `adb` cục bộ trên VM tự khởi server ở 5037 sẽ không chiếm cổng của tunnel.
- Không cần `adb tcpip`, không restart adbd hay adb server Windows.
- Loại: (b) `adb tcpip` thì phải restart adbd và lộ adb không xác thực; (c) Tailscale trên điện thoại thì phải cài app lên máy test; `adb -a` thì phải restart server Windows và lộ ra tailnet.

## Trạng thái hiện tại

- VM: platform-tools 37.0.1 (trùng phiên bản với Windows, tránh client tự kill server do lệch version) tại `~/platform-tools`. Disk: 55G trống.
- Helper: `~/adb-gauguin.sh [lệnh adb]`. Script đặt `ANDROID_ADB_SERVER_PORT=5038`, `ANDROID_SERIAL=c28004a8`, chặn `kill-server/tcpip/usb/reboot/start-server`, và báo lỗi nếu tunnel chưa mở.
- Đã kiểm tra: `~/adb-gauguin.sh shell getprop ro.product.device` trả về `gauguin`.
- Tunnel trên Windows: process `ssh.exe` PID 27260 (ẩn cửa sổ).

## Bật lại (sau khi reboot Windows/VM hoặc rớt mạng)

Trên Windows, chạy trong PowerShell:

```powershell
Start-Process ssh -WindowStyle Hidden -ArgumentList '-N -o BatchMode=yes -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -J root@<proxmox-tailnet-ip> -R 127.0.0.1:5038:127.0.0.1:5037 ubuntu@<vm-ip>'
```

adb server Windows phải đang chạy (`adb devices` trên Windows). Tunnel không tự bật lại sau reboot. Muốn tự bật thì thêm lệnh trên vào Task Scheduler (At logon).

## Tắt

- Windows: `Stop-Process -Id <PID>`. Lấy PID bằng `Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" | ? CommandLine -match '5038'`.

## Lưu ý

- Không lọc được theo serial: `adb devices` trên VM vẫn thấy iQOO (`adb-10CFBC0R3U0012F-...`). Helper luôn ép `-s c28004a8`.
- Nếu gọi `adb -P 5038 kill-server` trực tiếp (không qua helper) thì sẽ kill adb server **trên Windows** và ngắt mọi agent đang dùng USB.
