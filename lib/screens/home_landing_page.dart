import 'package:flutter/material.dart';

class HomeLandingPage extends StatelessWidget {
  const HomeLandingPage({super.key});

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final isDesktop = size.width >= 900;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tesseramento Mediterranea'),
        actions: <Widget>[
          TextButton.icon(
            onPressed: () => Navigator.pushNamed(context, '/admin'),
            icon: const Icon(Icons.admin_panel_settings_outlined),
            label: const Text('Admin'),
          ),
          const SizedBox(width: 12),
        ],
      ),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 560),
          child: Padding(
            padding: EdgeInsets.symmetric(
              horizontal: isDesktop ? 24 : 16,
              vertical: 24,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                ClipRRect(
                  borderRadius: BorderRadius.circular(18),
                  child: Image.asset(
                    'logopiccolo.png',
                    height: isDesktop ? 132 : 96,
                    fit: BoxFit.contain,
                  ),
                ),
                const SizedBox(height: 28),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 22),
                      textStyle: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    onPressed: () => Navigator.pushNamed(context, '/registration'),
                    icon: const Icon(Icons.how_to_reg_outlined),
                    label: const Text('Nuova registrazione'),
                  ),
                ),
                const SizedBox(height: 14),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 18),
                      textStyle: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    onPressed: () => Navigator.pushNamed(context, '/already-member'),
                    icon: const Icon(Icons.badge_outlined),
                    label: const Text('Ho gia la tessera!'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
