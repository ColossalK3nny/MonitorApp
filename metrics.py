import psutil, time, platform, os

BOOT_TIME = psutil.boot_time()

def snapshot():
    vm = psutil.virtual_memory()
    cpu = psutil.cpu_percent(interval=None)
    load = None
    try:
        load = os.getloadavg()  # (1,5,15)
    except Exception:
        load = (0.0, 0.0, 0.0)
    disks = {p.mountpoint: psutil.disk_usage(p.mountpoint)._asdict()
             for p in psutil.disk_partitions(all=False)
             if os.name == "nt" or p.fstype}  # skip unmapped
    net = psutil.net_io_counters()._asdict()
    return {
        "ts": time.time(),
        "host": platform.node(),
        "os": f"{platform.system()} {platform.release()}",
        "uptime_sec": int(time.time() - BOOT_TIME),
        "cpu_percent": cpu,
        "ram": {"total": vm.total, "used": vm.used, "percent": vm.percent},
        "loadavg": {"1": load[0], "5": load[1], "15": load[2]},
        "disks": disks,
        "net": net
    }
