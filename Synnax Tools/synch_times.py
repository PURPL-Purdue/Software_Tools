import paramiko, time

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('169.254.71.2', username='admin', password='password.com', timeout=5)

epoch = int(time.time())
stdin, stdout, stderr = client.exec_command(f'date -s @{epoch}')
print(stdout.read().decode())
client.close()
