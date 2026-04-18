import 'package:flutter/material.dart';
import 'package:carousel_slider/carousel_slider.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../services/supabase_service.dart';

const String _instagramOfficialSvg = '''
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="Instagram">
  <path fill="#E4405F" d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4c0 3.2-2.6 5.8-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8C2 4.6 4.6 2 7.8 2zm0 1.9A3.9 3.9 0 0 0 3.9 7.8v8.4a3.9 3.9 0 0 0 3.9 3.9h8.4a3.9 3.9 0 0 0 3.9-3.9V7.8a3.9 3.9 0 0 0-3.9-3.9H7.8zm8.9 1.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2z"/>
</svg>
''';

class HomeLandingPage extends StatefulWidget {
  const HomeLandingPage({super.key});

  @override
  State<HomeLandingPage> createState() => _HomeLandingPageState();
}

class _HomeLandingPageState extends State<HomeLandingPage> {
  LandingCarouselSettings _carouselSettings = const LandingCarouselSettings();
  String? _instagramUrl;
  bool _isLoadingMedia = false;
  String? _expandedImageUrl;

  @override
  void initState() {
    super.initState();
    _loadLandingMedia();
  }

  Future<void> _loadLandingMedia() async {
    if (!SupabaseService.instance.isConfigured) {
      return;
    }

    setState(() {
      _isLoadingMedia = true;
    });

    try {
      final settings = await SupabaseService.instance.getLandingCarouselSettings();
      final instagram = await SupabaseService.instance.getInstagramProfileUrl();
      if (!mounted) {
        return;
      }

      setState(() {
        _carouselSettings = settings;
        _instagramUrl = instagram;
      });
    } finally {
      if (mounted) {
        setState(() {
          _isLoadingMedia = false;
        });
      }
    }
  }

  Future<void> _openInstagram() async {
    final raw = _instagramUrl?.trim() ?? '';
    if (raw.isEmpty) {
      return;
    }

    final uri = Uri.tryParse(raw);
    if (uri == null) {
      return;
    }

    await launchUrl(uri, mode: LaunchMode.platformDefault);
  }

  @override
  Widget build(BuildContext context) {
    final isDesktop = MediaQuery.sizeOf(context).width >= 900;
    final carouselHeight = _carouselSettings.widgetHeight;
    final imageUrls = _carouselSettings.imageUrls;
    final visibleItems = _carouselSettings.visibleItems;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Tesseramento Mediterranea'),
        actions: <Widget>[
          IconButton(
            tooltip: 'Area admin',
            onPressed: () => Navigator.pushNamed(context, '/admin'),
            icon: const Icon(Icons.admin_panel_settings_outlined),
          ),
          const SizedBox(width: 5),
        ],
      ),
      body: Stack(
        children: <Widget>[
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 880),
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: isDesktop ? 24 : 16,
                  vertical: 24,
                ),
                child: SingleChildScrollView(
                  child: Column(
                    children: <Widget>[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(18),
                      child: Image.asset(
                        'logopiccolo.png',
                        height: isDesktop ? 132 : 96,
                        fit: BoxFit.contain,
                      ),
                    ),
                    const SizedBox(height: 18),
                    if (_isLoadingMedia)
                      const Padding(
                        padding: EdgeInsets.only(top: 12),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    else if (imageUrls.isNotEmpty)
                      Container(
                        width: double.infinity,
                        constraints: const BoxConstraints(maxWidth: 820),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(18),
                          child: CarouselSlider.builder(
                            itemCount: imageUrls.length,
                            itemBuilder: (context, index, realIndex) {
                              final imageUrl = imageUrls[index];
                              return GestureDetector(
                                onTap: () {
                                  setState(() {
                                    _expandedImageUrl = imageUrl;
                                  });
                                },
                                child: SizedBox.expand(
                                  child: Image.network(
                                    imageUrl,
                                    fit: BoxFit.contain,
                                    errorBuilder: (context, error, stackTrace) {
                                      return Container(
                                        color: Colors.transparent,
                                        alignment: Alignment.center,
                                        child: const Text(
                                          'Immagine non disponibile',
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              );
                            },
                            options: CarouselOptions(
                              height: carouselHeight,
                              initialPage: 0,
                              viewportFraction: imageUrls.length > 1
                                  ? (1 / visibleItems).clamp(0.28, 1).toDouble()
                                  : 1,
                              padEnds: true,
                              autoPlay: imageUrls.length > 1,
                              autoPlayInterval: Duration(
                                milliseconds:
                                    (_carouselSettings.autoplaySeconds * 1000)
                                        .round(),
                              ),
                              autoPlayAnimationDuration: const Duration(
                                milliseconds: 700,
                              ),
                              enlargeCenterPage: imageUrls.length > 1,
                              enlargeFactor: imageUrls.length > 1 ? 0.34 : 0,
                              enlargeStrategy: CenterPageEnlargeStrategy.zoom,
                            ),
                          ),
                        ),
                      )
                    else
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 40),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF4F6F3),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: Colors.grey.shade300),
                        ),
                        child: const Text(
                          'Il carosello verra mostrato qui.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    const SizedBox(height: 10),
                    IconButton(
                      tooltip: 'Apri profilo Instagram',
                      onPressed:
                          (_instagramUrl == null || _instagramUrl!.trim().isEmpty)
                          ? null
                          : _openInstagram,
                      iconSize: 34,
                      icon: SvgPicture.string(
                        _instagramOfficialSvg,
                        width: 32,
                        height: 32,
                        semanticsLabel: 'Instagram',
                        errorBuilder: (context, error, stackTrace) {
                          return const Icon(Icons.camera_alt_rounded);
                        },
                        placeholderBuilder: (_) => const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
                    //const Spacer(),
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
                    const SizedBox(height: 18),
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
          ),
          if (_expandedImageUrl != null)
            Positioned.fill(
              child: GestureDetector(
                onTap: () {
                  setState(() {
                    _expandedImageUrl = null;
                  });
                },
                child: ColoredBox(
                  color: Colors.black.withValues(alpha: 0.92),
                  child: InteractiveViewer(
                    minScale: 1,
                    maxScale: 4,
                    child: Center(
                      child: Image.network(
                        _expandedImageUrl!,
                        fit: BoxFit.contain,
                      ),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
